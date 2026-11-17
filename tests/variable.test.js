// Milestone M8: air with temperature-dependent specific heats (PHYSICS.md section 12), checked
// against tests/fixtures/reference-variable.json, which the independent Python reference wrote.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeGas, makeAir, gasFor, AIR_LOW, AIR_HIGH, R_AIR } from "../site/js/core/gas.js";
import { ratiosFor, ratiosFromHeat, solveCycle } from "../site/js/core/cycle.js";
import { pointOnProcess, energyAlong, sampleProcess } from "../site/js/core/paths.js";
import { solveRForPmax, sideRatios } from "../site/js/core/compare.js";
import { buildTimeline, frameAt, statePhases } from "../site/js/core/timeline.js";
import { buildModel, solveCycleFor, solveColdCycleFor, axisBounds } from "../site/js/core/model.js";
import { exploreCurves, compareCurves, etaCurveSolved } from "../site/js/core/efficiency.js";
import { texValues, rawValues, fillValues } from "../site/js/core/values.js";
import { stateRow } from "../site/js/core/tables.js";
import { contentFor } from "../site/js/core/content.js";
import { CONTENT, VARIABLE } from "../site/js/content/content.js";
import { defaultState } from "../site/js/state/defaults.js";
import { assertClose, assertDeepClose } from "./helpers.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/reference-variable.json", import.meta.url), "utf8"));
const air = makeAir();
const psi = (T) => air.sT(T) - R_AIR * Math.log(T);

function solveAirCase(c) {
  const { type, P1, T1, params } = c.spec;
  const ratios = ratiosFor(type, params, T1, air);
  return { ratios, solution: solveCycle({ type, P1, T1, ...ratios, gas: air }) };
}
const cases = fx.cycles.map((c) => ({ c, ...solveAirCase(c) }));
const byName = Object.fromEntries(cases.map((x) => [x.c.name, x.solution]));

// ---------------------------------------------------------------------- the air properties

test("air: the coefficient arrays are the fixture's, verbatim", () => {
  assert.deepEqual(AIR_LOW, fx.air.low);
  assert.deepEqual(AIR_HIGH, fx.air.high);
  assert.equal(air.R, fx.air.R);
  assert.equal(air.kind, "variable");
  assert.equal(air.k, undefined);
  assert.equal(air.cv, undefined);
  assert.equal(air.cp, undefined);
});

test("air: property samples from 150 K to 6000 K, both extended ends included", () => {
  assert.equal(fx.air.samples.length, 18);
  for (const s of fx.air.samples) {
    const label = `T = ${s.T}`;
    assertClose(air.cpAt(s.T), s.cp, `${label} cp`);
    assertClose(air.cvAt(s.T), s.cv, `${label} cv`);
    assertClose(air.kAt(s.T), s.k, `${label} k`);
    assertClose(air.u(s.T), s.u, `${label} u`);
    assertClose(air.h(s.T), s.h, `${label} h`);
    assertClose(air.sT(s.T), s.sT, `${label} sT`);
    assertClose(psi(s.T), s.psi, `${label} psi`);
  }
});

test("air: TfromU, TfromH and the isentropes reproduce the fixture samples", () => {
  for (const x of fx.air.fromU) assertClose(air.TfromU(x.u), x.T, `TfromU(${x.u})`);
  for (const x of fx.air.fromH) assertClose(air.TfromH(x.h), x.T, `TfromH(${x.h})`);
  assert.equal(fx.air.isentropes.length, 8);
  for (const x of fx.air.isentropes) {
    assertClose(air.isentropicT(x.Ta, x.vRatio), x.Tb, `isentropicT(${x.Ta}, ${x.vRatio})`);
  }
});

test("air: the spot values of PHYSICS.md section 12.1", () => {
  const near = (a, b, tol) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);
  for (const [T, cp, k] of [[300, 1.0031, 1.4008], [1000, 1.1422, 1.3356], [2000, 1.2502, 1.2980]]) {
    near(air.cpAt(T), cp, 5e-5);
    near(air.kAt(T), k, 5e-5);
  }
  near(air.u(300), 214.33, 5e-3);
  near(air.h(1000), 1046.28, 5e-3);
});

test("air: continuous at 200, 1000 and 3500 K, and everything increases with T", () => {
  for (const T of [200, 1000, 3500]) {
    const e = 1e-7;
    for (const [name, f] of [["h", air.h], ["u", air.u], ["sT", air.sT]]) {
      assert.ok(Math.abs(f(T + e) - f(T - e)) < 1e-5, `${name} jumps at ${T} K`);
    }
    assert.ok(Math.abs(air.cpAt(T + e) - air.cpAt(T - e)) < 1e-6, `cp jumps at ${T} K`);
  }
  let prev = null;
  for (let T = 1; T <= 20000; T *= 1.01) {
    const now = { u: air.u(T), h: air.h(T), sT: air.sT(T), psi: psi(T) };
    if (prev) for (const key of Object.keys(now)) assert.ok(now[key] > prev[key], `${key} not increasing at ${T} K`);
    prev = now;
  }
});

test("air: held at the edge's cp outside 200-3500 K", () => {
  assert.equal(air.cpAt(100), air.cpAt(200));
  assert.equal(air.cpAt(6000), air.cpAt(3500));
  assertClose(air.h(5000) - air.h(4000), air.cpAt(3500) * 1000, "h slope above 3500 K");
});

test("air: the inverses round-trip, including the extended ends", () => {
  for (const T of [5, 100, 199, 200, 250, 300, 999, 1000, 1001, 1800, 3499, 3500, 3600, 6000, 50000]) {
    assertClose(air.TfromU(air.u(T)), T, `TfromU(u(${T}))`, 1e-10);
    assertClose(air.TfromH(air.h(T)), T, `TfromH(h(${T}))`, 1e-10);
  }
  for (const [Ta, x] of [[300, 1 / 8], [300, 1 / 26], [1900, 8], [2500, 20], [250, 1.3], [4000, 3]]) {
    const Tb = air.isentropicT(Ta, x);
    assertClose(air.isentropicT(Tb, 1 / x), Ta, `isentrope round trip ${Ta} x ${x}`, 1e-10);
    assertClose(psi(Tb) - psi(Ta), -R_AIR * Math.log(x), `psi change ${Ta} x ${x}`, 1e-9);
  }
  assertClose(air.isentropicT(777, 1), 777, "vRatio = 1 is the same state");
});

test("the constant gas has the same members, and they are the closed forms", () => {
  const g = makeGas({ k: 1.3 });
  assert.equal(g.kind, "constant");
  assert.equal(g.kAt(1234), 1.3);
  assert.equal(g.cvAt(1), g.cv);
  assert.equal(g.cpAt(1), g.cp);
  assertClose(g.u(500), g.cv * 500, "u");
  assertClose(g.h(500), g.cp * 500, "h");
  assertClose(g.TfromU(g.u(321)), 321, "TfromU");
  assertClose(g.TfromH(g.h(321)), 321, "TfromH");
  assertClose(g.isentropicT(300, 1 / 8), 300 * 8 ** 0.3, "isentropicT");
  assertClose(g.sT(900) - g.sT(300), g.cp * Math.log(3), "sT");
  assert.equal(gasFor("constant", 1.3).k, 1.3);
  assert.equal(gasFor("variable", 1.3).kind, "variable");
});

// ---------------------------------------------------------------------- the cycles

test("every variable fixture case: ratios, states, stateProps, processes, metrics", () => {
  assert.equal(fx.cycles.length, 10);
  for (const { c, ratios, solution } of cases) {
    assert.equal(solution.gas.kind, c.gas.kind);
    assert.equal(solution.gas.R, c.gas.R);
    assertDeepClose(ratios, c.ratios, `${c.name} ratios`);
    assertDeepClose(solution.states, c.states, `${c.name} states`);
    assertDeepClose(solution.processes, c.processes, `${c.name} processes`);
    assertDeepClose(solution.metrics, c.metrics, `${c.name} metrics`);
    for (const [id, expected] of Object.entries(c.stateProps)) {
      const T = solution.states[id].T;
      assertDeepClose(
        { cp: air.cpAt(T), cv: air.cvAt(T), k: air.kAt(T), u: air.u(T), h: air.h(T), sT: air.sT(T), psi: psi(T) },
        expected,
        `${c.name} stateProps ${id}`,
      );
    }
  }
});

test("every variable fixture case: midpoints with their running energy", () => {
  for (const { c, solution } of cases) {
    assert.equal(c.midpoints.length, 3 * solution.processes.length);
    for (const m of c.midpoints) {
      const label = `${c.name} ${m.process} ${m.lambda}`;
      const pt = pointOnProcess(solution, m.process, m.lambda);
      assertDeepClose(pt, { P: m.P, T: m.T, v: m.v, s: m.s }, label);
      const energy = energyAlong(solution, m.process, pt);
      if (solution.processes.find((p) => p.id === m.process).degenerate) {
        // A zero-length process: q, w and du are mathematically zero. The reference holds
        // rounding noise there (about 1e-13, one last digit of h), which no arithmetic order
        // reproduces on every platform, so these are compared to 1e-9 absolute.
        for (const key of ["q", "w", "du"]) assert.ok(Math.abs(energy[key] - m.energy[key]) <= 1e-9, `${label} energy.${key}`);
      } else {
        assertDeepClose(energy, m.energy, `${label} energy`);
      }
    }
  }
});

test("every variable fixture case: the cold-air reference cycle", () => {
  for (const { c } of cases) {
    const { type, P1, T1, params } = c.spec;
    const cold = solveColdCycleFor(type, params, { T1, P1, k: 1.23 }); // the k slider is ignored
    assertDeepClose(cold.inputs && { r: cold.inputs.r, rp: cold.inputs.rp, rc: cold.inputs.rc }, c.cold.ratios, `${c.name} cold ratios`);
    assertClose(cold.metrics.eta, c.cold.eta, `${c.name} cold eta`);
    assertClose(cold.metrics.Tmax, c.cold.Tmax, `${c.name} cold Tmax`);
    assertClose(cold.metrics.Pmax, c.cold.Pmax, `${c.name} cold Pmax`);
    assert.equal(cold.gas.kind, "constant");
    assert.equal(cold.gas.k, 1.4);
  }
});

test("the reference values of PHYSICS.md section 12.7", () => {
  const row = (name) => byName[name];
  const r1 = (x) => Math.round(x * 10) / 10;
  const otto = row("otto-default");
  assert.deepEqual([otto.states["2"].T, otto.states["3"].T, otto.states["4"].T].map(r1), [672.6, 1592.9, 805.4]);
  assert.equal(r1(otto.metrics.mep), 554.1);
  assert.equal((100 * otto.metrics.eta).toFixed(2), "52.18");
  const t290 = row("otto-290K");
  assert.deepEqual([t290.states["2"].T, t290.states["3"].T].map(r1), [651.9, 1575.7]);
  assert.equal((100 * t290.metrics.eta).toFixed(2), "52.30");
  assert.equal((100 * row("diesel-default").metrics.eta).toFixed(2), "57.88");
  assert.equal((100 * row("dual-default").metrics.eta).toFixed(2), "59.40");
  // Otto depends on qin now: 400, 800, 1600
  const etaAt = (qin) => solveCycleFor("otto", { r: 8, qin }, { T1: 300, P1: 100, k: 1.4 }, "variable").metrics.eta;
  assert.deepEqual([400, 800, 1600].map((q) => (100 * etaAt(q)).toFixed(2)), ["53.73", "52.18", "50.06"]);
});

test("first law for every process and the cycle; P v = R T; psi and entropy close", () => {
  for (const { c, solution } of cases) {
    const label = c.name;
    let sumQ = 0, sumW = 0, sumDu = 0;
    for (const p of solution.processes) {
      assert.ok(Math.abs(p.q - p.w - p.du) < 1e-9, `${label} ${p.id}: q - w = du`);
      sumQ += p.q; sumW += p.w; sumDu += p.du;
    }
    assert.ok(Math.abs(sumQ - sumW) < 1e-9, `${label}: sum q = sum w`);
    assert.ok(Math.abs(sumDu) < 1e-9, `${label}: sum du = 0`);
    for (const [id, st] of Object.entries(solution.states)) {
      assertClose(st.P * st.v, R_AIR * st.T, `${label} state ${id}: P v = R T`, 1e-12);
    }
    const s = solution.states, { r } = solution.inputs;
    assertClose(psi(s["2"].T) - psi(s["1"].T), R_AIR * Math.log(r), `${label} psi(T2) - psi(T1) = R ln r`, 1e-10);
    const back = s["4"].s + air.sT(s["1"].T) - air.sT(s["4"].T) - R_AIR * Math.log(s["1"].T / s["4"].T);
    assert.ok(Math.abs(back) < 1e-10, `${label}: entropy returns to 0 at state 1 (${back})`);
    // every sampled point of every drawn process is on the ideal-gas line too
    for (const p of solution.processes.filter((x) => !x.degenerate)) {
      for (const pt of sampleProcess(solution, p.id)) assertClose(pt.P * pt.v, R_AIR * pt.T, `${label} ${p.id} P v = R T`, 1e-12);
    }
  }
});

test("a dual cycle with rc = 1 or rp = 1 flags the degenerate process and equals Otto or Diesel", () => {
  const asOtto = byName["dual-as-otto"], asDiesel = byName["dual-as-diesel"];
  assert.equal(asOtto.processes.find((p) => p.id === "x-3").degenerate, true);
  assert.equal(asOtto.processes.find((p) => p.id === "2-x").degenerate, false);
  assert.equal(asDiesel.processes.find((p) => p.id === "2-x").degenerate, true);
  assert.equal(asDiesel.processes.find((p) => p.id === "x-3").degenerate, false);
  const otto = solveCycle({ type: "otto", P1: 100, T1: 300, r: 9, rp: 2.5, rc: 1, gas: air });
  const diesel = solveCycle({ type: "diesel", P1: 100, T1: 300, r: 18, rp: 1, rc: 2, gas: air });
  for (const id of ["1", "2", "3", "4"]) {
    assertDeepClose(asOtto.states[id], otto.states[id], `Otto state ${id}`);
    assertDeepClose(asDiesel.states[id], diesel.states[id], `Diesel state ${id}`);
  }
  assertClose(asOtto.metrics.eta, otto.metrics.eta, "Otto eta");
  assertClose(asDiesel.metrics.eta, diesel.metrics.eta, "Diesel eta");
});

test("a dual cycle with rp = rc = 1 adds no heat: efficiency does not exist", () => {
  const s = solveCycle({ type: "dual", P1: 100, T1: 300, r: 10, rp: 1, rc: 1, gas: air });
  assert.ok(Number.isNaN(s.metrics.eta));
});

// ---------------------------------------------------------------------- the same code, the constant gas

test("ratiosFromHeat and solveRForPmax with the constant gas agree with the closed forms", () => {
  const gas = makeGas();
  const { r, qin, xv } = { r: 12, qin: 1000, xv: 0.5 };
  const T2 = 300 * r ** 0.4;
  const rp = 1 + (xv * qin) / (gas.cv * T2);
  const rc = 1 + ((1 - xv) * qin) / (gas.cp * rp * T2);
  assertDeepClose(ratiosFromHeat({ r, qin, xv }, 300, gas), { r, rp, rc }, "ratiosFromHeat");
  const rr = solveRForPmax({ Pmax: 7000, qin: 1000, xv: 0.5 }, 100, 300, gas);
  assertClose(rr, 13.56, "r at Pmax = 7000", 5e-3 / 13.56); // PHYSICS.md quotes 13.56
  assert.equal(ratiosFromHeat({ r: 10, qin: 500, xv: 1 }, 300, gas).rc, 1);
  assert.equal(ratiosFromHeat({ r: 10, qin: 500, xv: 0 }, 300, gas).rp, 1);
});

// ---------------------------------------------------------------------- compare

test("every variable fixture comparison: each side's ratios and metrics", () => {
  assert.equal(fx.compare.length, 4);
  for (const c of fx.compare) {
    const shared = c.constraint === "same-r-qin" ? { r: c.r, qin: c.qin } : { Pmax: c.Pmax, qin: c.qin };
    for (const side of c.sides) {
      const label = `${c.constraint} ${side.type}`;
      const rt = sideRatios(c.constraint, shared, { type: side.type, xv: side.xv, params: {} }, c.P1, c.T1, air);
      assertDeepClose(rt, side.ratios, `${label} ratios`);
      const s = solveCycle({ type: side.type, P1: c.P1, T1: c.T1, ...rt, gas: air });
      assertDeepClose(s.metrics, side.metrics, `${label} metrics`);
    }
  }
});

test("compare mode with variable specific heats: the model uses the air gas and has no cold cycle", () => {
  for (const c of fx.compare) {
    const st = defaultState();
    st.mode = "compare";
    st.specificHeats = "variable";
    st.compare.constraint = c.constraint;
    st.compare.shared = { r: c.r ?? 12, qin: c.qin, Pmax: c.Pmax ?? 7000 };
    st.compare.a = { ...st.compare.a, type: c.sides[0].type, xv: c.sides[0].xv };
    st.compare.b = { ...st.compare.b, type: c.sides[1].type, xv: c.sides[1].xv };
    const m = buildModel(st);
    assert.equal(m.cycles.length, 2);
    m.cycles.forEach((cy, i) => {
      assert.equal(cy.solution.gas.kind, "variable");
      assert.equal(cy.cold, undefined);
      assertDeepClose(cy.solution.metrics, c.sides[i].metrics, `${c.constraint} ${i} metrics`);
    });
  }
});

test("solveRForPmax with air: hits Pmax and qin, and is null when Pmax is too low", () => {
  const xv = 0.5, qin = 1000;
  const r = solveRForPmax({ Pmax: 7000, qin, xv }, 100, 300, air);
  const s = solveCycle({ type: "dual", P1: 100, T1: 300, ...ratiosFromHeat({ r, qin, xv }, 300, air), gas: air });
  assertClose(s.metrics.Pmax, 7000, "Pmax");
  assertClose(s.metrics.qin, qin, "qin");
  assert.equal(solveRForPmax({ Pmax: 150, qin: 1500, xv: 1 }, 100, 300, air), null);
});

// ---------------------------------------------------------------------- efficiency

const fixedRatios = (rp, rc) => () => ({ rp, rc });

test("the variable efficiency grid: Otto, Diesel and dual at every fixture point", () => {
  assert.equal(fx.efficiency.length, 35);
  const T1 = 300, P1 = 100;
  const on = (curve, r) => {
    const pt = curve.find(([x]) => Math.abs(x - r) < 1e-9);
    assert.ok(pt, `no curve point at r = ${r}`);
    return pt[1];
  };
  for (const e of fx.efficiency) {
    const label = `${e.type} r=${e.r}`;
    if (e.type === "otto") {
      const curve = etaCurveSolved("otto", (r) => ratiosFor("otto", { r, qin: e.qin }, T1, air), P1, T1, air);
      assertClose(on(curve, e.r), e.eta, `${label} qin=${e.qin}`);
    } else {
      const [rp, rc] = e.type === "diesel" ? [1, e.rc] : [e.rp, e.rc];
      const curve = etaCurveSolved(e.type, fixedRatios(rp, rc), P1, T1, air);
      assertClose(on(curve, e.r), e.eta, `${label} rc=${e.rc}`);
    }
  }
});

test("variable curves skip the points where rc >= r", () => {
  const curve = etaCurveSolved("diesel", fixedRatios(1, 4), 100, 300, air);
  assert.ok(curve.length > 0 && curve.every(([r]) => r > 4));
});

test("explore curves with variable specific heats: labels, references and the cold-air curve", () => {
  const st = defaultState();
  st.specificHeats = "variable";
  const otto = exploreCurves(buildModel(st).cycles[0].solution);
  assert.equal(otto.main.length, 1);
  assert.deepEqual(otto.main[0].label, [["q", "in", " = 800"]]);
  assert.deepEqual(otto.refs.map((x) => x.key), ["cold", "qin400", "qin1600"]);
  assert.deepEqual(otto.refs[0].label, [["", "", "cold air, "], ["k", "", " = 1.4"]]);
  assert.deepEqual(otto.refs[1].label, [["q", "in", " = 400"]]);
  // the cold-air curve is the constant-gas Otto curve; the real one falls below it
  const at8 = (c) => c.points.find(([r]) => r === 8)[1];
  assertClose(at8(otto.refs[0]), 1 - 8 ** -0.4, "cold curve at r = 8");
  assertClose(at8(otto.main[0]), otto.markers[0].eta, "bold curve passes through the marker");
  assert.ok(at8(otto.refs[1]) > at8(otto.main[0]) && at8(otto.main[0]) > at8(otto.refs[2]), "more heat, lower efficiency");
  assertClose(at8(otto.refs[1]), 0.5373, "qin = 400", 1e-3);
  // a reference within 1e-6 of the current qin is left out
  st.params.otto.qin = 400;
  assert.deepEqual(exploreCurves(buildModel(st).cycles[0].solution).refs.map((x) => x.key), ["cold", "qin1600"]);
  // Diesel and dual
  st.cycle = "diesel";
  const diesel = exploreCurves(buildModel(st).cycles[0].solution);
  assert.deepEqual(diesel.main[0].label, [["r", "c", " = 2"]]);
  assert.deepEqual(diesel.refs.map((x) => x.key), ["cold"]);
  st.cycle = "dual";
  const dual = exploreCurves(buildModel(st).cycles[0].solution);
  assert.deepEqual(dual.main[0].label, [["", "", "Dual"]]);
  assert.deepEqual(dual.refs.map((x) => x.key), ["cold"]);
});

test("explore curves with constant specific heats are unchanged by the gas interface", () => {
  const c = exploreCurves(buildModel(defaultState()).cycles[0].solution);
  assert.deepEqual(c.refs.map((x) => x.key), ["k1.3", "k1.667"]);
  assert.equal(c.main[0].points.length, 97);
});

test("compare curves with variable specific heats pass through each side's marker", () => {
  const st = defaultState();
  st.mode = "compare";
  st.specificHeats = "variable";
  const m = buildModel(st);
  const c = compareCurves(m, st);
  assert.equal(c.main.length, 2);
  c.main.forEach((curve, i) => {
    const mk = c.markers[i];
    const pt = curve.points.find(([r]) => Math.abs(r - mk.r) < 1e-9);
    assert.ok(pt, `curve ${i} has a point at r = ${mk.r}`);
    assertClose(pt[1], mk.eta, `curve ${i} meets its marker`);
  });
});

// ---------------------------------------------------------------------- the timeline

test("every variable fixture timeline: slot table, state phases and every frame", () => {
  assert.equal(fx.timelines.length, 7);
  for (const t of fx.timelines) {
    const solution = byName[t.case];
    const label = `${t.case}${t.strokes ? " strokes" : ""}${t.force.length ? ` force ${t.force}` : ""}`;
    const timeline = buildTimeline(solution, { strokes: t.strokes, force: t.force });
    assertDeepClose(timeline, t.timeline, `${label} timeline`);
    assertDeepClose(statePhases(timeline), t.statePhases, `${label} statePhases`);
    const n = t.strokes ? 24 : 16;
    assert.equal(t.frames.length, n);
    t.frames.forEach((expected, j) => {
      const frame = frameAt(solution, timeline, (j + 0.5) / n);
      assertDeepClose(frame, expected, `${label} frame ${j}`, { allowExtra: true });
    });
  }
});

// ---------------------------------------------------------------------- the model, tables, values

test("defaults: constant specific heats, cold-air cycle switch on", () => {
  const st = defaultState();
  assert.equal(st.specificHeats, "constant");
  assert.equal(st.options.coldCycle, true);
  const m = buildModel(st);
  assert.equal(m.cycles[0].solution.gas.kind, "constant");
  assert.equal(m.cycles[0].cold, undefined);
});

test("explore model with variable specific heats: the cycle entry carries the cold-air cycle", () => {
  const st = defaultState();
  st.specificHeats = "variable";
  st.shared.k = 1.67; // hidden slider, ignored by the cold cycle
  const m = buildModel(st);
  const [entry] = m.cycles;
  assert.equal(entry.solution.gas.kind, "variable");
  assertClose(entry.solution.metrics.eta, fx.cycles[0].metrics.eta, "eta");
  assertClose(entry.cold.solution.metrics.eta, fx.cycles[0].cold.eta, "cold eta");
  assert.equal(entry.cold.solution.gas.k, 1.4);
  assert.deepEqual(Object.keys(entry.cold.samples).sort(), Object.keys(entry.samples).sort());
  assert.ok(entry.cold.samples["1-2"].length > 0);
  // the axis bounds include the cold cycle exactly while the switch is on
  assert.ok(entry.cold.solution.states["3"].T > entry.solution.states["3"].T);
  const withCold = axisBounds(m.cycles, true), without = axisBounds(m.cycles, false);
  assert.deepEqual(m.bounds, withCold);
  assert.ok(withCold.ts.T[1] >= entry.cold.solution.states["3"].T);
  st.options.coldCycle = false;
  assert.deepEqual(buildModel(st).bounds, without);
  assert.ok(without.ts.T[1] >= entry.solution.states["3"].T);
});

test("the state table's u - u1 comes from the gas", () => {
  const sol = byName["otto-default"];
  const st = { P: 500, T: 450, v: 0.3, s: 0 };
  assertClose(stateRow(sol, st).du, air.u(450) - air.u(300), "variable du");
  const cold = solveCycleFor("otto", { r: 8, qin: 800 }, defaultState().shared);
  assertClose(stateRow(cold, st).du, cold.gas.cv * 150, "constant du");
});

test("texValues for variable specific heats: u, h, etaCold, and k, cv, cp at T1", () => {
  const sol = byName["otto-default"];
  const cold = solveColdCycleFor("otto", { r: 8, qin: 800 }, { T1: 300, P1: 100, k: 1.4 });
  const v = texValues(sol, cold);
  assert.equal(v.u1, "214.3");
  assert.equal(v.u2, (air.u(sol.states["2"].T)).toFixed(1));
  assert.equal(v.h2, (air.h(sol.states["2"].T)).toFixed(1));
  assert.equal(v.etaCold, "56.5\\%");
  assert.equal(v.eta, "52.2\\%");
  const raw = rawValues(sol, cold);
  assertClose(raw.k, air.kAt(300), "k at T1");
  assertClose(raw.cp, air.cpAt(300), "cp at T1");
  assertClose(raw.cv, air.cvAt(300), "cv at T1");
  // without a cold cycle, etaCold is the cycle's own efficiency
  assert.equal(texValues(sol).etaCold, "52.2\\%");
  assert.equal(fillValues(String.raw`u_1 = \val{u1}`, v), String.raw`u_1 = 214.3`);
});

test("texValues for constant specific heats: the new names exist and k is the gas k", () => {
  const sol = solveCycleFor("otto", { r: 8, qin: 800 }, { T1: 300, P1: 100, k: 1.4 });
  const v = texValues(sol);
  assert.equal(v.k, "1.4");
  assert.equal(v.km1, "0.4");
  assert.equal(v.u1, (0.7175 * 300).toFixed(1));
  assert.equal(v.etaCold, v.eta);
});

// ---------------------------------------------------------------------- contentFor

test("contentFor: constant is CONTENT itself", () => {
  assert.equal(contentFor("constant"), CONTENT);
  assert.equal(contentFor(undefined), CONTENT);
});

test("contentFor: variable merges VARIABLE over CONTENT, and is memoized", () => {
  const c = contentFor("variable");
  assert.equal(c, contentFor("variable"));
  assert.notEqual(c, CONTENT);
  // model replaced
  assert.equal(c.model, VARIABLE.model);
  // symbols appended
  assert.equal(c.symbols.length, CONTENT.symbols.length + VARIABLE.symbols.length);
  assert.deepEqual(c.symbols.slice(0, CONTENT.symbols.length), CONTENT.symbols);
  assert.deepEqual(c.symbols.slice(CONTENT.symbols.length), VARIABLE.symbols);
  // an overridden field replaced, an unlisted one kept
  const proc = c.cycles.otto.processes["1-2"];
  assert.equal(proc.equations, VARIABLE.cycles.otto.processes["1-2"].equations);
  assert.equal(proc.notice, VARIABLE.cycles.otto.processes["1-2"].notice);
  assert.equal(proc.what, CONTENT.cycles.otto.processes["1-2"].what);
  assert.equal(proc.title, CONTENT.cycles.otto.processes["1-2"].title);
  assert.deepEqual(proc.trends, CONTENT.cycles.otto.processes["1-2"].trends);
  assert.equal(c.cycles.otto.intro.equations, VARIABLE.cycles.otto.intro.equations);
  assert.equal(c.cycles.otto.intro.text, CONTENT.cycles.otto.intro.text);
  assert.equal(c.cycles.otto.summary.text, VARIABLE.cycles.otto.summary.text);
  // Diesel's summary has no `text` override in VARIABLE: it keeps CONTENT's
  assert.equal(c.cycles.diesel.summary.equations, VARIABLE.cycles.diesel.summary.equations);
  // everything else is CONTENT's own
  assert.equal(c.strokes, CONTENT.strokes);
  assert.equal(c.roles, CONTENT.roles);
  assert.equal(c.compare, CONTENT.compare);
  assert.equal(c.cycles.otto.name, CONTENT.cycles.otto.name);
  // CONTENT itself is not modified
  assert.notEqual(CONTENT.cycles.otto.processes["1-2"].equations, VARIABLE.cycles.otto.processes["1-2"].equations);
  // every process of every cycle is still there
  for (const type of Object.keys(CONTENT.cycles)) {
    assert.deepEqual(Object.keys(c.cycles[type].processes), Object.keys(CONTENT.cycles[type].processes));
  }
});
