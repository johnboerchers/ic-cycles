// Tests for the M3 core helpers: log axes, picking, tables and results, parameter input.
import test from "node:test";
import assert from "node:assert/strict";
import { niceLower, logScale, logTicks, NICE_SERIES } from "../site/js/core/scale.js";
import { formatLogTicks, formatValue } from "../site/js/core/format.js";
import { nearestPhase, distanceToPolyline } from "../site/js/core/pick.js";
import { stateRows, activeStates, energyTerms, resultValues, addsHeat, stateRow } from "../site/js/core/tables.js";
import { parseNumber, clampTo, inRange } from "../site/js/core/params.js";
import { buildModel, phaseSamples, solveCycleFor, framesAt } from "../site/js/core/model.js";
import { frameAt } from "../site/js/core/timeline.js";
import { defaultState, PARAMS, SHARED } from "../site/js/state/defaults.js";
import { assertClose } from "./helpers.js";

const stateFor = (cycle, patch = {}) => ({ ...defaultState(), cycle, ...patch });
const withParams = (cycle, p, shared = {}) => {
  const d = defaultState();
  return stateFor(cycle, {
    params: { ...d.params, [cycle]: { ...d.params[cycle], ...p } },
    shared: { ...d.shared, ...shared },
  });
};

// ------------------------------------------------------------------ log axes

test("niceLower: the series value at or below x", () => {
  const cases = [[95.238, 80], [0.1025, 0.1], [1, 1], [0.0999, 0.08], [7.9, 6], [12, 12], [11.9, 10]];
  for (const [x, want] of cases) assert.equal(niceLower(x), want, `niceLower(${x})`);
  for (const s of NICE_SERIES) assert.equal(niceLower(s * 100), s * 100);
  assert.throws(() => niceLower(0));
});

test("logScale maps decades to equal lengths and inverts", () => {
  const f = logScale([0.1, 10], [0, 200]);
  assertClose(f(1), 100, "middle decade");
  assertClose(f.invert(150), Math.sqrt(10), "invert");
  assertClose(f(f.invert(37)), 37, "round trip");
});

test("logTicks: 1-2-5 inside the bounds, decades only when there are many", () => {
  assert.deepEqual(logTicks(0.08, 1), [0.1, 0.2, 0.5, 1]);
  assert.deepEqual(logTicks(80, 6000), [100, 200, 500, 1000, 2000, 5000]);
  assert.deepEqual(logTicks(1, 1e6), [1, 10, 100, 1000, 10000, 100000, 1000000]);
  assert.ok(logTicks(2, 6).length >= 3);
  assert.deepEqual(formatLogTicks([0.05, 0.1, 0.2, 1, 100, 5000]), ["0.05", "0.1", "0.2", "1", "100", "5000"]);
});

test("on log–log P–v axes an isentrope is a straight line of slope −k", () => {
  const m = buildModel(stateFor("otto"));
  const { solution, samples } = m.cycles[0];
  const sx = logScale(m.bounds.pvLog.v, [0, 400]);
  const sy = logScale(m.bounds.pvLog.P, [300, 0]);
  for (const id of ["1-2", "3-4"]) {
    const pts = samples[id].map((p) => [sx(p.v), sy(p.P)]);
    const slope = (a, b) => (b[1] - a[1]) / (b[0] - a[0]);
    const s0 = slope(pts[0], pts[pts.length - 1]);
    for (let i = 1; i < pts.length; i++) assertClose(slope(pts[i - 1], pts[i]), s0, `${id} straight`, 1e-6);
  }
  // Both isentropes have the same slope in screen space: parallel.
  const slopeOf = (id) => {
    const a = samples[id][0], b = samples[id][samples[id].length - 1];
    return (sy(b.P) - sy(a.P)) / (sx(b.v) - sx(a.v));
  };
  assertClose(slopeOf("1-2"), slopeOf("3-4"), "parallel", 1e-9);
  // In data terms the slope is −k.
  const a = solution.states["1"], b = solution.states["2"];
  assertClose(Math.log(b.P / a.P) / Math.log(b.v / a.v), -1.4, "slope −k");
});

test("pvLog bounds contain every state", () => {
  for (const cycle of ["otto", "diesel", "dual"]) {
    const m = buildModel(stateFor(cycle));
    const { v, P } = m.bounds.pvLog;
    for (const st of Object.values(m.cycles[0].solution.states)) {
      assert.ok(st.v > v[0] && st.v < v[1] && st.P > P[0] && st.P < P[1], `${cycle} ${JSON.stringify(st)}`);
    }
  }
});

test("axes stay fixed while r moves inside a band, and rescale across bands", () => {
  const P = (r) => buildModel(withParams("otto", { r })).bounds.pv.P[1];
  assert.equal(P(6), P(6.5));
  assert.notEqual(P(6), P(12));
  for (let r = 4; r <= 16; r += 0.5) assert.ok(P(r) >= 1.05 * buildModel(withParams("otto", { r })).cycles[0].solution.metrics.Pmax);
});

// ------------------------------------------------------------------ picking

test("distanceToPolyline", () => {
  assertClose(distanceToPolyline([[0, 0], [10, 0], [10, 10]], 5, 3), 3, "to first leg");
  assertClose(distanceToPolyline([[0, 0], [10, 0], [10, 10]], 13, 5), 3, "to second leg");
  assertClose(distanceToPolyline([[2, 2]], 5, 6), 5, "single point");
});

test("nearestPhase refines between samples and closes the loop", () => {
  const sq = [{ u: 0, x: 0, y: 0 }, { u: 0.25, x: 10, y: 0 }, { u: 0.5, x: 10, y: 10 }, { u: 0.75, x: 0, y: 10 }];
  assertClose(nearestPhase(sq, 4, -1).u, 0.1, "first side");
  assertClose(nearestPhase(sq, 4, -1).dist, 1, "distance");
  assertClose(nearestPhase(sq, 11, 5).u, 0.375, "second side");
  assertClose(nearestPhase(sq, -1, 6).u, 0.85, "closing side, u up to 1");
  assert.equal(nearestPhase(sq, -1, 0.0).u, 0);
});

test("dragging finds the phase of a point on the cycle (P–v screen space)", () => {
  const m = buildModel(stateFor("diesel"));
  const cycle = m.cycles[0];
  const sx = (v) => 600 * v, sy = (P) => 400 - P / 20;
  const samples = phaseSamples(cycle).map((p) => ({ u: p.u, x: sx(p.state.v), y: sy(p.state.P) }));
  assert.equal(samples.length, 600);
  for (const u of [0.1, 0.3, 0.45, 0.62, 0.9]) {
    const f = frameAt(cycle.solution, cycle.timeline, u);
    const hit = nearestPhase(samples, sx(f.state.v), sy(f.state.P));
    assert.ok(hit.dist < 1e-6, `u = ${u}: dist ${hit.dist}`);
    const g = framesAt(m, hit.u)[0];
    assertClose(g.state.P, f.state.P, `P at ${u}`, 1e-6);
    assertClose(g.state.v, f.state.v, `v at ${u}`, 1e-6);
  }
});

// ------------------------------------------------------------------ tables

// PHYSICS.md section 10, "Reference values at a glance".
const REFERENCE = {
  otto: { T2: 689.2, T3: 1804.2, T4: 785.3, P3: "4811", qin: 800.0, qout: 348.2, wnet: 451.8, eta: "56.5 %", mep: 599.7 },
  diesel: { T2: 953.3, T3: 1906.6, T4: 791.7, P3: "5720", qin: 957.6, qout: 352.8, wnet: 604.8, eta: "63.2 %", mep: 743.8 },
  dual: { T2: 909.4, T3: 2046.2, T4: 793.9, P3: "7275", qin: 1011.4, qout: 354.3, wnet: 657.1, eta: "65.0 %", mep: 814.0 },
};

test("state rows and results match the reference table for the default cycles", () => {
  for (const cycle of ["otto", "diesel", "dual"]) {
    const { solution } = buildModel(stateFor(cycle)).cycles[0];
    const list = stateRows(solution);
    const rows = Object.fromEntries(list.map((r) => [r.id, r]));
    const ref = REFERENCE[cycle];
    assert.deepEqual(list.map((r) => r.id), cycle === "dual" ? ["1", "2", "x", "3", "4"] : ["1", "2", "3", "4"]);
    assert.equal(formatValue("T", rows["2"].T), ref.T2.toFixed(1));
    assert.equal(formatValue("T", rows["3"].T), ref.T3.toFixed(1));
    assert.equal(formatValue("T", rows["4"].T), ref.T4.toFixed(1));
    assert.equal(formatValue("P", rows["3"].P), ref.P3);
    assert.equal(formatValue("u", rows["1"].du), "0.0");
    assert.equal(formatValue("s", rows["1"].s), "0.0000");
    // u − u1 at state 2 is the compression work.
    assertClose(rows["2"].du, solution.processes[0].du, "du2");
    const res = resultValues(solution);
    assert.equal(formatValue("q", res.qin), ref.qin.toFixed(1));
    assert.equal(formatValue("q", res.qout), ref.qout.toFixed(1));
    assert.equal(formatValue("w", res.wnet), ref.wnet.toFixed(1));
    assert.equal(formatValue("mep", res.mep), ref.mep.toFixed(1));
    assert.equal(formatValue("eta", res.eta), ref.eta);
  }
});

test("efficiencies named in the M3 browser checks", () => {
  const eta = (cycle, p, shared) => formatValue("eta", resultValues(buildModel(withParams(cycle, p, shared)).cycles[0].solution).eta);
  assert.equal(eta("otto", { r: 6 }), "51.2 %");
  assert.equal(eta("otto", { r: 12 }), "63.0 %");
  assert.equal(eta("otto", { qin: 1200 }), "56.5 %");
  assert.equal(eta("diesel", { r: 18, rc: 2 }), "63.2 %");
  assert.equal(eta("diesel", { r: 18, rc: 3 }), "58.9 %");
  assert.equal(eta("otto", { r: 8 }, { k: 1.667 }), "75.0 %");
});

test("Otto results carry the derived pressure ratio; Carnot uses Tmax and T1", () => {
  const res = resultValues(buildModel(stateFor("otto")).cycles[0].solution);
  assert.equal(formatValue("ratio", res.rp), "2.618");
  assertClose(res.etaCarnot, 1 - 300 / res.Tmax, "Carnot");
});

test("a dual cycle with rp = rc = 1 adds no heat: every result is missing", () => {
  const { solution } = buildModel(withParams("dual", { rp: 1, rc: 1 })).cycles[0];
  assert.equal(addsHeat(solution), false);
  const res = resultValues(solution);
  for (const key of ["eta", "etaCarnot", "wnet", "qin", "qout", "mep", "Tmax", "Pmax"]) {
    assert.equal(formatValue("q", res[key]), "—", key);
  }
  assert.deepEqual(stateRows(solution).map((r) => r.id), ["1", "2", "3", "4"]);
});

test("activeStates: the rows at the ends of the current process", () => {
  const m = buildModel(stateFor("dual"));
  const [c] = m.cycles;
  const at = (u) => activeStates(c.solution, frameAt(c.solution, c.timeline, u));
  const slot = (id) => c.timeline.slots.find((s) => s.id === id);
  const mid = (id) => (slot(id).u0 + slot(id).u1) / 2;
  assert.deepEqual(at(mid("C")), ["1", "2"]);
  assert.deepEqual(at(mid("HV")), ["2", "x"]);
  assert.deepEqual(at(mid("HP")), ["x", "3"]);
  assert.deepEqual(at(mid("R")), ["4", "1"]);
  // Dual with rc = 1: x coincides with 3, so 2-x highlights 2 and 3.
  const m2 = buildModel(withParams("dual", { rc: 1 }));
  const [c2] = m2.cycles;
  const hv = c2.timeline.slots.find((s) => s.id === "HV");
  assert.deepEqual(activeStates(c2.solution, frameAt(c2.solution, c2.timeline, (hv.u0 + hv.u1) / 2)), ["2", "3"]);
  // Dual with rp = 1: x coincides with 2, so x-3 highlights 2 and 3.
  const m3 = buildModel(withParams("dual", { rp: 1 }));
  const [c3] = m3.cycles;
  const hp = c3.timeline.slots.find((s) => s.id === "HP");
  assert.deepEqual(activeStates(c3.solution, frameAt(c3.solution, c3.timeline, (hp.u0 + hp.u1) / 2)), ["2", "3"]);
});

test("energyTerms: magnitudes with in/out subscripts", () => {
  const { solution } = buildModel(stateFor("diesel")).cycles[0];
  const byId = Object.fromEntries(solution.processes.map((p) => [p.id, energyTerms(p)]));
  assert.deepEqual(byId["1-2"].q, { sub: null, value: 0 });
  assert.equal(byId["1-2"].w.sub, "in");
  assert.equal(formatValue("w", byId["1-2"].w.value), formatValue("w", solution.metrics.win));
  assert.equal(byId["2-3"].q.sub, "in");
  assert.equal(formatValue("q", byId["2-3"].q.value), "957.6");
  assert.equal(byId["2-3"].w.sub, "out");
  assert.equal(formatValue("w", byId["2-3"].w.value), "273.6");
  assert.equal(byId["3-4"].w.sub, "out");
  assert.equal(byId["4-1"].q.sub, "out");
  assert.equal(formatValue("q", byId["4-1"].q.value), "352.8");
  assert.deepEqual(byId["4-1"].w, { sub: null, value: 0 });
});

test("stateRow for a moving point: u − u1 = cv (T − T1)", () => {
  const sol = solveCycleFor("otto", { r: 8, qin: 800 }, defaultState().shared);
  const row = stateRow(sol, { P: 500, T: 450, v: 0.3, s: 0 });
  assertClose(row.du, sol.gas.cv * 150, "du");
});

// ------------------------------------------------------------------ parameter input

test("parseNumber accepts complete numbers and ignores incomplete input", () => {
  for (const [s, want] of [["18", 18], ["2", 2], ["1.667", 1.667], [" 0.5 ", 0.5], [".5", 0.5], ["1,5", 1.5], ["7.", 7]]) {
    assert.equal(parseNumber(s), want, s);
  }
  for (const s of ["", "-", ".", "1e", "abc", "1.2.3", "+"]) assert.equal(parseNumber(s), null, s);
});

test("range rules: typed values are exact inside the range and clamped outside it", () => {
  assert.ok(inRange(18, PARAMS.diesel.r));
  assert.ok(inRange(2, PARAMS.diesel.rc));
  assert.ok(inRange(1.667, SHARED.k));
  assert.ok(!inRange(1, PARAMS.diesel.r));
  assert.equal(clampTo(30, PARAMS.diesel.r), 26);
  assert.equal(clampTo(0.5, PARAMS.diesel.rc), 1.1);
  assert.equal(clampTo(18.3, PARAMS.diesel.r), 18.3);
});
