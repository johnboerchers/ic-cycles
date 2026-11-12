import test from "node:test";
import assert from "node:assert/strict";
import { makeGas } from "../site/js/core/gas.js";
import { solveCycle, ratiosFor } from "../site/js/core/cycle.js";
import { solveRForPmax, sideRatios } from "../site/js/core/compare.js";
import { fixture, assertClose, assertDeepClose } from "./helpers.js";

test("every fixture comparison: each side's ratios and metrics", () => {
  assert.equal(fixture.compare.length, 4);
  for (const c of fixture.compare) {
    const gas = makeGas({ k: c.k });
    const shared = c.constraint === "same-r-qin" ? { r: c.r, qin: c.qin } : { Pmax: c.Pmax, qin: c.qin };
    for (const side of c.sides) {
      const label = `${c.constraint} ${side.type}`;
      const rt = sideRatios(c.constraint, shared, { type: side.type, xv: side.xv, params: {} }, c.P1, c.T1, gas);
      assertDeepClose(rt, side.ratios, `${label} ratios`);
      const s = solveCycle({ type: side.type, P1: c.P1, T1: c.T1, ...rt, gas });
      assertDeepClose(s.metrics, side.metrics, `${label} metrics`);
    }
  }
});

test("the compare-mode numbers quoted in PHYSICS.md section 10", () => {
  const gas = makeGas();
  const eta = (constraint, shared, type, xv) => {
    const rt = sideRatios(constraint, shared, { type, xv, params: {} }, 100, 300, gas);
    return [rt.r, solveCycle({ type, P1: 100, T1: 300, ...rt, gas }).metrics.eta];
  };
  const pct = (x) => (100 * x).toFixed(2);
  const same = { r: 12, qin: 1000 };
  assert.equal(pct(eta("same-r-qin", same, "otto")[1]), "62.99");
  assert.equal(pct(eta("same-r-qin", same, "dual", 0.5)[1]), "61.84");
  assert.equal(pct(eta("same-r-qin", same, "diesel")[1]), "55.45");
  const pmax = { Pmax: 7000, qin: 1000 };
  for (const [type, xv, r, e] of [["diesel", 0, "20.79", "65.29"], ["dual", 0.5, "13.56", "63.69"], ["otto", 1, "9.81", "59.88"]]) {
    const [gotR, gotEta] = eta("same-pmax-qin", pmax, type, xv);
    assert.equal(gotR.toFixed(2), r, `${type} r`);
    assert.equal(pct(gotEta), e, `${type} eta`);
  }
});

test("required 9: solveRForPmax meets the request, and is null when infeasible", () => {
  for (const k of [1.3, 1.4]) {
    const gas = makeGas({ k });
    for (const Pmax of [3000, 7000, 12000]) {
      for (const qin of [300, 1000, 1800]) {
        for (const [type, xv] of [["otto", 1], ["dual", 0.5], ["dual", 0.2], ["diesel", 0]]) {
          const label = `k=${k} Pmax=${Pmax} qin=${qin} ${type} xv=${xv}`;
          const r = solveRForPmax({ Pmax, qin, xv }, 100, 300, gas);
          if (r === null) continue; // checked below
          const rt = sideRatios("same-pmax-qin", { Pmax, qin }, { type, xv }, 100, 300, gas);
          assert.equal(rt.r, r, label);
          const m = solveCycle({ type, P1: 100, T1: 300, ...rt, gas }).metrics;
          assertClose(m.Pmax, Pmax, `${label} Pmax`);
          assertClose(m.qin, qin, `${label} qin`);
        }
      }
    }
  }
  const gas = makeGas();
  // 1000 kJ/kg at constant volume at r = 1 already reaches about 565 kPa
  assert.equal(solveRForPmax({ Pmax: 400, qin: 1000, xv: 1 }, 100, 300, gas), null);
  assert.equal(sideRatios("same-pmax-qin", { Pmax: 400, qin: 1000 }, { type: "otto", xv: 1 }, 100, 300, gas), null);
  assert.notEqual(solveRForPmax({ Pmax: 400, qin: 1000, xv: 0 }, 100, 300, gas), null);
  assert.equal(solveRForPmax({ Pmax: 90, qin: 0, xv: 0 }, 100, 300, gas), null);
});

test("sideRatios: independent uses native inputs; Otto and Diesel ignore a stray xv", () => {
  const gas = makeGas();
  const dual = { type: "dual", xv: 0.5, params: { r: 16, rp: 1.5, rc: 1.5 } };
  assert.deepEqual(sideRatios("independent", {}, dual, 100, 300, gas), ratiosFor("dual", dual.params, 300, gas));
  const otto = sideRatios("same-r-qin", { r: 12, qin: 1000 }, { type: "otto", xv: 0.5 }, 100, 300, gas);
  assert.equal(otto.rc, 1);
  const diesel = sideRatios("same-r-qin", { r: 12, qin: 1000 }, { type: "diesel", xv: 0.5 }, 100, 300, gas);
  assert.equal(diesel.rp, 1);
  assert.throws(() => sideRatios("same-everything", {}, dual, 100, 300, gas));
});
