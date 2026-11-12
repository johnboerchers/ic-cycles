import test from "node:test";
import assert from "node:assert/strict";
import { makeGas } from "../site/js/core/gas.js";
import {
  PROCESS_TABLE, ratiosFor, ratiosFromHeat, solveCycle, etaClosedForm,
} from "../site/js/core/cycle.js";
import { fixture, assertClose, assertDeepClose, solveCase, seededRandom } from "./helpers.js";

const STATES = ["1", "2", "x", "3", "4"];

test("every fixture cycle: ratios, states, processes and metrics", () => {
  assert.equal(fixture.cycles.length, 9);
  for (const c of fixture.cycles) {
    const { ratios, solution } = solveCase(c);
    assertDeepClose(ratios, c.ratios, `${c.name} ratios`);
    assertDeepClose(solution.states, c.states, `${c.name} states`);
    assertDeepClose(solution.processes, c.processes, `${c.name} processes`);
    assertDeepClose(solution.metrics, c.metrics, `${c.name} metrics`);
    assert.equal(solution.type, c.spec.type);
    assertDeepClose(solution.inputs, { P1: c.spec.P1, T1: c.spec.T1, ...c.ratios }, `${c.name} inputs`);
  }
});

test("process table matches the processes of each type", () => {
  assert.deepEqual(PROCESS_TABLE.otto.map((p) => p.id), ["1-2", "2-3", "3-4", "4-1"]);
  assert.deepEqual(PROCESS_TABLE.diesel.map((p) => p.kind), ["isentropic", "constP", "isentropic", "constV"]);
  assert.deepEqual(PROCESS_TABLE.dual.map((p) => p.role),
    ["compression", "heatAdditionV", "heatAdditionP", "expansion", "heatRejection"]);
});

test("efficiency grid: closed form matches the fixture", () => {
  assert.equal(fixture.efficiency.length, 90);
  for (const e of fixture.efficiency) {
    const rp = e.rp ?? 1, rc = e.rc ?? 1;
    assertClose(etaClosedForm({ r: e.r, rp, rc, k: e.k }), e.eta, `${e.fn} r=${e.r} rc=${rc} k=${e.k}`);
  }
});

test("reference values at a glance (PHYSICS.md section 10)", () => {
  const table = {
    "otto-default": [8, 2.6177, 1, 689.2, 1804.2, 785.3, 4811, 800.0, 348.2, 451.8, 56.47, 599.7],
    "diesel-default": [18, 1, 2, 953.3, 1906.6, 791.7, 5720, 957.6, 352.8, 604.8, 63.16, 743.8],
    "dual-default": [16, 1.5, 1.5, 909.4, 2046.2, 793.9, 7275, 1011.4, 354.3, 657.1, 64.97, 814.0],
  };
  for (const [name, row] of Object.entries(table)) {
    const { ratios: rt, solution: s } = solveCase(fixture.cycles.find((c) => c.name === name));
    const m = s.metrics, st = s.states;
    const got = [rt.r, rt.rp, rt.rc, st["2"].T, st["3"].T, st["4"].T, st["3"].P,
      m.qin, m.qout, m.wnet, 100 * m.eta, m.mep];
    const decimals = [0, 4, 0, 1, 1, 1, 0, 1, 1, 1, 2, 1];
    got.forEach((x, i) => assert.equal(x.toFixed(decimals[i]), row[i].toFixed(decimals[i]), `${name} column ${i}`));
  }
});

test("required 1: first law for every process and over the cycle", () => {
  for (const c of fixture.cycles) {
    const { solution: s } = solveCase(c);
    let sq = 0, sw = 0, sdu = 0;
    for (const p of s.processes) {
      assert.ok(Math.abs(p.q - p.w - p.du) <= 1e-9, `${c.name} ${p.id}: q − w ≠ du`);
      sq += p.q; sw += p.w; sdu += p.du;
    }
    assertClose(sq, sw, `${c.name} Σq = Σw`);
    assertClose(sw, s.metrics.wnet, `${c.name} Σw = wnet`);
    assertClose(s.metrics.qin - s.metrics.qout, s.metrics.wnet, `${c.name} qin − qout = wnet`);
    assertClose(s.metrics.wout - s.metrics.win, s.metrics.wnet, `${c.name} wout − win = wnet`);
    assert.ok(Math.abs(sdu) <= 1e-9, `${c.name} Σdu = ${sdu}`);
  }
});

test("required 2: ideal gas law at all five states", () => {
  for (const c of fixture.cycles) {
    const { solution: s } = solveCase(c);
    for (const id of STATES) {
      const { P, v, T } = s.states[id];
      assertClose(P * v, s.gas.R * T, `${c.name} state ${id}: Pv = RT`);
    }
  }
});

test("entropy closes and T4 = rp·rc^k·T1", () => {
  for (const c of fixture.cycles) {
    const { solution: s } = solveCase(c);
    const { rp, rc, T1 } = s.inputs;
    assert.ok(Math.abs(s.states["4"].s + s.gas.cv * Math.log(T1 / s.states["4"].T)) <= 1e-9, c.name);
    assertClose(s.states["4"].T, rp * rc ** s.gas.k * T1, `${c.name} T4`);
  }
});

test("required 3: eta equals the closed form for random valid inputs", () => {
  const rand = seededRandom(20261112);
  const types = ["otto", "diesel", "dual"];
  for (let i = 0; i < 300; i++) {
    const type = types[i % 3];
    const k = 1.2 + 0.47 * rand();
    const r = 2 + 24 * rand();
    const rp = type === "diesel" ? 1 : 1 + 3 * rand();
    const rc = type === "otto" ? 1 : 1 + 3 * rand();
    const gas = makeGas({ k });
    const s = solveCycle({ type, P1: 80 + 40 * rand(), T1: 270 + 60 * rand(), r, rp, rc, gas });
    assertClose(s.metrics.eta, etaClosedForm({ r, rp, rc, k }), `case ${i} ${type}`);
  }
});

test("closed form: Otto and Diesel limits, and 0/0 gives the Otto value", () => {
  for (const k of [1.3, 1.4]) {
    for (const r of [6, 12, 20]) {
      const otto = 1 - r ** (1 - k);
      assertClose(etaClosedForm({ r, rp: 1, rc: 1, k }), otto, "0/0");
      assertClose(etaClosedForm({ r, rp: 2.3, rc: 1, k }), otto, "rc = 1");
      const rc = 2.5;
      const diesel = 1 - r ** (1 - k) * (rc ** k - 1) / (k * (rc - 1));
      assertClose(etaClosedForm({ r, rp: 1, rc, k }), diesel, "rp = 1");
    }
  }
});

function assertSameCycle(dual, other, mapping, label) {
  for (const id of STATES) assertDeepClose(dual.states[id], other.states[id], `${label} state ${id}`);
  assertDeepClose(dual.metrics, other.metrics, `${label} metrics`);
  for (const [dualId, otherId] of Object.entries(mapping)) {
    const a = dual.processes.find((p) => p.id === dualId);
    if (otherId === null) {
      assert.equal(a.degenerate, true, `${label} ${dualId} flagged degenerate`);
      assert.deepEqual([a.q, a.w, a.du], [0, 0, 0], `${label} ${dualId} has no energy`);
    } else {
      const b = other.processes.find((p) => p.id === otherId);
      assert.equal(a.degenerate, false, `${label} ${dualId} not degenerate`);
      assertDeepClose({ q: a.q, w: a.w, du: a.du }, { q: b.q, w: b.w, du: b.du }, `${label} ${dualId}`);
    }
  }
}

test("required 4: dual cycle limits reproduce Otto and Diesel", () => {
  for (const k of [1.3, 1.4, 5 / 3]) {
    const gas = makeGas({ k });
    const base = { P1: 100, T1: 300, gas };
    const rp = 2.2, rc = 2.1;
    assertSameCycle(
      solveCycle({ type: "dual", r: 9, rp, rc: 1, ...base }),
      solveCycle({ type: "otto", r: 9, rp, rc: 1, ...base }),
      { "1-2": "1-2", "2-x": "2-3", "x-3": null, "3-4": "3-4", "4-1": "4-1" },
      `k=${k} dual rc=1`,
    );
    assertSameCycle(
      solveCycle({ type: "dual", r: 18, rp: 1, rc, ...base }),
      solveCycle({ type: "diesel", r: 18, rp: 1, rc, ...base }),
      { "1-2": "1-2", "2-x": null, "x-3": "2-3", "3-4": "3-4", "4-1": "4-1" },
      `k=${k} dual rp=1`,
    );
  }
  // only heat additions can be degenerate, and Otto/Diesel never are
  for (const c of fixture.cycles) {
    const { solution: s } = solveCase(c);
    for (const p of s.processes) {
      if (p.degenerate) assert.ok(p.role.startsWith("heatAddition") && c.spec.type === "dual", `${c.name} ${p.id}`);
    }
  }
});

test("no heat added (dual, rp = rc = 1): eta is NaN", () => {
  const s = solveCycle({ type: "dual", P1: 100, T1: 300, r: 10, rp: 1, rc: 1, gas: makeGas() });
  assert.ok(s.processes.filter((p) => p.degenerate).length === 2);
  assert.ok(Number.isNaN(s.metrics.eta));
});

test("native inputs: Otto keeps qin when r changes, Diesel keeps rc", () => {
  const gas = makeGas();
  for (const r of [6, 8, 12]) {
    const rt = ratiosFor("otto", { r, qin: 800 }, 300, gas);
    const s = solveCycle({ type: "otto", P1: 100, T1: 300, ...rt, gas });
    assertClose(s.metrics.qin, 800, `otto qin at r=${r}`);
    assert.deepEqual(ratiosFor("diesel", { r, rc: 2 }, 300, gas), { r, rp: 1, rc: 2 });
  }
  for (const xv of [0, 0.3, 1]) {
    const rt = ratiosFromHeat({ r: 14, qin: 1000, xv }, 300, gas);
    const s = solveCycle({ type: "dual", P1: 100, T1: 300, ...rt, gas });
    assertClose(s.metrics.qin, 1000, `ratiosFromHeat qin at xv=${xv}`);
    const qV = s.processes.find((p) => p.id === "2-x").q;
    assert.ok(Math.abs(qV - xv * 1000) <= 1e-9 * 1000, `constant-volume share at xv=${xv}`);
  }
});
