// Milestone M6: compare mode in the model (two cycles on one shared timeline) and the data
// behind the efficiency chart.

import test from "node:test";
import assert from "node:assert/strict";
import { buildModel, framesAt, timelineSegments, phaseOf } from "../site/js/core/model.js";
import { frameAt } from "../site/js/core/timeline.js";
import { makeGas } from "../site/js/core/gas.js";
import { solveRForPmax } from "../site/js/core/compare.js";
import { exploreCurves, compareCurves, spreadLabels } from "../site/js/core/efficiency.js";
import { defaultState } from "../site/js/state/defaults.js";
import { formatValue } from "../site/js/core/format.js";
import { fixture, assertClose, assertDeepClose } from "./helpers.js";

// A compare-mode state: the defaults with some of the compare settings changed.
function compareState({ constraint, shared, a, b } = {}) {
  const st = defaultState();
  const c = st.compare;
  return {
    ...st,
    mode: "compare",
    compare: {
      constraint: constraint ?? c.constraint,
      shared: { ...c.shared, ...shared },
      a: { ...c.a, ...a },
      b: { ...c.b, ...b },
    },
  };
}

const PAIRS = [
  ["otto", "diesel"], ["diesel", "otto"], ["otto", "dual"], ["dual", "diesel"],
  ["otto", "otto"], ["diesel", "diesel"], ["dual", "dual"],
];
const CONSTRAINTS = ["same-r-qin", "same-pmax-qin", "independent"];

test("compare model: default is Otto versus Diesel at r = 12, q_in = 1000", () => {
  const m = buildModel(compareState());
  assert.equal(m.mode, "compare");
  assert.deepEqual(m.cycles.map((c) => [c.id, c.side, c.label]), [["a", "A", "A: Otto cycle"], ["b", "B", "B: Diesel cycle"]]);
  const [a, b] = m.cycles;
  assert.equal(formatValue("eta", a.solution.metrics.eta), "63.0 %");
  assert.equal(formatValue("eta", b.solution.metrics.eta), "55.4 %");
  // both cycles share state 1 and state 2 (same r): one compression curve
  assertDeepClose(a.solution.states["1"], b.solution.states["1"], "state 1");
  assertDeepClose(a.solution.states["2"], b.solution.states["2"], "state 2");
  // the axes cover both cycles
  assert.ok(m.bounds.pv.P[1] >= a.solution.metrics.Pmax);
  assert.ok(m.bounds.ts.T[1] >= a.solution.metrics.Tmax);
});

test("compare model: every fixture comparison", () => {
  for (const c of fixture.compare) {
    const shared = c.constraint === "same-r-qin" ? { r: c.r, qin: c.qin } : { Pmax: c.Pmax, qin: c.qin };
    const [sa, sb] = c.sides;
    const m = buildModel(compareState({ constraint: c.constraint, shared, a: { type: sa.type, xv: sa.xv }, b: { type: sb.type, xv: sb.xv } }));
    m.cycles.forEach((cy, i) => {
      const label = `${c.constraint} ${cy.id} ${c.sides[i].type}`;
      assertDeepClose(cy.solution.inputs.r, c.sides[i].ratios.r, `${label} r`);
      assertDeepClose(cy.solution.metrics, c.sides[i].metrics, `${label} metrics`);
    });
  }
});

test("compare model: the numbers in the M6 browser check", () => {
  const eta = (m) => m.cycles.map((c) => formatValue("eta", c.solution.metrics.eta));
  const r = (m) => m.cycles.map((c) => c.solution.inputs.r.toFixed(2));
  const pmax = buildModel(compareState({ constraint: "same-pmax-qin" }));
  assert.deepEqual(r(pmax), ["9.81", "20.79"]);
  assert.deepEqual(eta(pmax), ["59.9 %", "65.3 %"]);
  for (const c of pmax.cycles) assertClose(c.solution.metrics.Pmax, 7000, `${c.id} Pmax`);
  const dual = buildModel(compareState({ b: { type: "dual", xv: 0.5 } }));
  assert.deepEqual(eta(dual), ["63.0 %", "61.8 %"]);
});

test("compare model: independent sides use their own parameters", () => {
  const m = buildModel(compareState({
    constraint: "independent",
    a: { type: "otto", params: { r: 8, qin: 800 } },
    b: { type: "diesel", params: { r: 18, rc: 2 } },
  }));
  assert.deepEqual(m.cycles.map((c) => formatValue("eta", c.solution.metrics.eta)), ["56.5 %", "63.2 %"]);
});

test("compare model: both timelines have identical slot boundaries", () => {
  for (const constraint of CONSTRAINTS) {
    for (const [ta, tb] of PAIRS) {
      const m = buildModel(compareState({ constraint, a: { type: ta, params: defaultState().params[ta] }, b: { type: tb, params: defaultState().params[tb] } }));
      const [a, b] = m.cycles;
      const label = `${constraint} ${ta}/${tb}`;
      assert.equal(a.timeline.totalSeconds, b.timeline.totalSeconds, `${label} total`);
      a.timeline.slots.forEach((s, i) => {
        const o = b.timeline.slots[i];
        assert.equal(s.id, o.id);
        assert.equal(s.seconds, o.seconds, `${label} ${s.id} seconds`);
        assert.equal(s.u0, o.u0, `${label} ${s.id} u0`);
        assert.equal(s.u1, o.u1, `${label} ${s.id} u1`);
      });
      // no strokes in compare mode, even with the switch left on
      const on = buildModel({ ...compareState({ constraint, a: { type: ta, params: defaultState().params[ta] }, b: { type: tb, params: defaultState().params[tb] } }), options: { ...defaultState().options, strokes: true } });
      assert.equal(on.cycles[0].timeline.slots.find((s) => s.id === "X").seconds, 0, `${label} no strokes`);
    }
  }
});

test("compare model: a cycle waits through a slot only the other one has", () => {
  for (const constraint of CONSTRAINTS) {
    for (const [ta, tb] of PAIRS) {
      const m = buildModel(compareState({ constraint, a: { type: ta, params: defaultState().params[ta] }, b: { type: tb, params: defaultState().params[tb] } }));
      const label = `${constraint} ${ta}/${tb}`;
      m.cycles.forEach((c, i) => {
        const other = m.cycles[1 - i];
        for (const s of c.timeline.slots) {
          if (s.u1 <= s.u0) continue;
          const mine = s.processId !== null;
          const theirs = other.timeline.slots.find((x) => x.id === s.id).processId !== null;
          assert.ok(mine || theirs, `${label} ${s.id}: a slot neither cycle has is empty`);
          for (const tau of [0.01, 0.3, 0.7, 0.99]) {
            const f = frameAt(c.solution, c.timeline, s.u0 + tau * (s.u1 - s.u0));
            assert.equal(f.slot, s.id);
            assert.equal(f.waiting, !mine, `${label} ${c.id} ${s.id} tau ${tau} waiting`);
            if (!mine) {
              assert.equal(f.theta, 0, `${label} ${c.id} waits at TDC`);
              assert.equal(f.heatIn, 0);
              assert.equal(f.workSign, 0);
            }
          }
        }
      });
    }
  }
});

test("compare model: Otto versus Diesel during heat addition, and both at BDC together", () => {
  const m = buildModel(compareState());
  const [a, b] = m.cycles;
  const hv = a.timeline.slots.find((s) => s.id === "HV");
  const hp = a.timeline.slots.find((s) => s.id === "HP");
  const at = (u) => framesAt(m, u);
  // HV: Otto adds heat at TDC, Diesel waits at state 2
  let [fa, fb] = at(hv.u0 + 0.5 * (hv.u1 - hv.u0));
  assert.equal(fa.waiting, false);
  assert.equal(fa.xhat, 0);
  assert.ok(fa.heatIn > 0);
  assert.equal(fb.waiting, true);
  assertDeepClose(fb.state, b.solution.states["2"], "Diesel waits at 2");
  // HP: Otto waits at state 3, Diesel moves down while adding heat
  [fa, fb] = at(hp.u0 + 0.5 * (hp.u1 - hp.u0));
  assert.equal(fa.waiting, true);
  assertDeepClose(fa.state, a.solution.states["3"], "Otto waits at 3");
  assert.equal(fb.waiting, false);
  assert.ok(fb.xhat > 0 && fb.heatIn > 0 && fb.workSign === 1);
  // the end of expansion: both at BDC
  const e = a.timeline.slots.find((s) => s.id === "E");
  [fa, fb] = at(e.u1 - 1e-9);
  assertClose(fa.xhat, 1, "A at BDC");
  assertClose(fb.xhat, 1, "B at BDC");
  // the playhead's phase comes from the shared timeline
  assert.equal(phaseOf(m, { slot: "HP", tau: 0 }), hp.u0);
});

test("compare model: timeline bar labels name the cycle that has a slot alone", () => {
  const labels = (m) => timelineSegments(m).map((s) => s.label);
  assert.deepEqual(labels(buildModel(compareState())), ["1→2", "A 2→3", "B 2→3", "3→4", "4→1"]);
  assert.deepEqual(labels(buildModel(compareState({ b: { type: "dual" } }))), ["1→2", "2→3 / 2→x", "B x→3", "3→4", "4→1"]);
  assert.deepEqual(labels(buildModel(compareState({ b: { type: "otto" } }))), ["1→2", "2→3", "3→4", "4→1"]);
  // process ids stay those of a cycle that has the process
  assert.deepEqual(timelineSegments(buildModel(compareState())).map((s) => s.processId), ["1-2", "2-3", "2-3", "3-4", "4-1"]);
  // explore mode is unchanged
  assert.deepEqual(labels(buildModel(defaultState())), ["1→2", "2→3", "3→4", "4→1"]);
});

test("compare model: every side can meet the peak pressure anywhere on the sliders", () => {
  // Pmax 4000-12000, q_in 400-1200 (SPEC section 15) with T1, P1 and k anywhere in their ranges.
  for (const k of [1.2, 1.67]) {
    const gas = makeGas({ k });
    for (const T1 of [250, 400]) for (const P1 of [50, 200]) for (const qin of [400, 1200]) {
      for (const xv of [0, 0.5, 1]) {
        assert.notEqual(solveRForPmax({ Pmax: 4000, qin, xv }, P1, T1, gas), null, `k ${k} T1 ${T1} P1 ${P1} qin ${qin} xv ${xv}`);
      }
    }
  }
});

// ------------------------------------------------------------------------ efficiency curves

const atR = (points, r) => points.find((p) => Math.abs(p[0] - r) < 1e-9)[1];

test("efficiency: Otto curve with the two k references, marker at r = 8", () => {
  const { solution } = buildModel(defaultState()).cycles[0];
  const c = exploreCurves(solution);
  assert.equal(c.main.length, 1);
  assert.deepEqual(c.refs.map((x) => x.key), ["k1.3", "k1.667"]);
  assert.equal(c.main[0].points[0][0], 2);
  assert.equal(c.main[0].points.at(-1)[0], 26);
  assert.equal(formatValue("eta", c.markers[0].eta), "56.5 %");
  assert.equal(c.markers[0].r, 8);
  assertClose(atR(c.main[0].points, 8), c.markers[0].eta, "marker on the curve");
  // a higher k is more efficient at every r
  const [k13, k1667] = c.refs.map((x) => x.points);
  k13.forEach((p, i) => assert.ok(p[1] < c.main[0].points[i][1] && c.main[0].points[i][1] < k1667[i][1]));
});

test("efficiency: Diesel references r_c = 1, 3, 4 (2 is the main curve), ordered top to bottom", () => {
  const { solution } = buildModel({ ...defaultState(), cycle: "diesel" }).cycles[0];
  const c = exploreCurves(solution);
  assert.deepEqual(c.refs.map((x) => x.key), ["rc1", "rc3", "rc4"]);
  const all = [c.refs[0], c.main[0], c.refs[1], c.refs[2]].map((x) => x.points);
  for (let i = 1; i < all.length; i++) all[i].forEach((p, j) => assert.ok(p[1] < all[i - 1][j][1]));
  assert.equal(formatValue("eta", c.markers[0].eta), "63.2 %");
  // with r_c = 2.5 all four references show
  const other = buildModel({ ...defaultState(), cycle: "diesel", params: { ...defaultState().params, diesel: { r: 18, rc: 2.5 } } });
  assert.deepEqual(exploreCurves(other.cycles[0].solution).refs.map((x) => x.key), ["rc1", "rc2", "rc3", "rc4"]);
});

test("efficiency: dual lies between Otto and the Diesel curve with its r_c; no heat, no curve", () => {
  const st = defaultState();
  const c = exploreCurves(buildModel({ ...st, cycle: "dual" }).cycles[0].solution);
  assert.deepEqual(c.refs.map((x) => x.key), ["otto", "diesel"]);
  c.main[0].points.forEach((p, j) => assert.ok(p[1] < c.refs[0].points[j][1] && p[1] > c.refs[1].points[j][1]));
  const none = buildModel({ ...st, cycle: "dual", params: { ...st.params, dual: { r: 16, rp: 1, rc: 1 } } });
  const n = exploreCurves(none.cycles[0].solution);
  assert.equal(n.main.length, 0);
  assert.equal(n.markers.length, 0);
});

test("efficiency: compare curves hold q_in and the heat split fixed; markers at each side's r", () => {
  const st = compareState({ constraint: "same-pmax-qin" });
  const m = buildModel(st);
  const c = compareCurves(m, st);
  assert.deepEqual(c.main.map((x) => x.key), ["a", "b"]);
  assert.deepEqual(c.markers.map((x) => formatValue("eta", x.eta)), ["59.9 %", "65.3 %"]);
  // each marker lies on its curve
  m.cycles.forEach((cy, i) => {
    assertClose(c.markers[i].r, cy.solution.inputs.r, "marker r");
    const near = c.main[i].points.reduce((a, p) => (Math.abs(p[0] - cy.solution.inputs.r) < Math.abs(a[0] - cy.solution.inputs.r) ? p : a));
    assert.ok(Math.abs(near[1] - c.markers[i].eta) < 0.01, `${cy.id} marker near its curve`);
  });
  // same r and q_in: at r = 12 the curves pass through the two efficiencies
  const s2 = compareState();
  const c2 = compareCurves(buildModel(s2), s2);
  assert.equal(formatValue("eta", atR(c2.main[0].points, 12)), "63.0 %");
  assert.equal(formatValue("eta", atR(c2.main[1].points, 12)), "55.4 %");
});

test("spreadLabels keeps order, keeps a gap and stays inside the range", () => {
  assert.deepEqual(spreadLabels([10, 50, 100], 12), [10, 50, 100]);
  const out = spreadLabels([50, 52, 55, 100], 12);
  for (let i = 1; i < out.length; i++) assert.ok(out[i] - out[i - 1] >= 12 - 1e-9);
  assertClose(out[1], 52.333333333333336, "centered on the wanted mean");
  const clamped = spreadLabels([0, 1, 2], 10, 5, 100);
  assert.deepEqual(clamped, [5, 15, 25]);
  const top = spreadLabels([95, 96], 10, 0, 100);
  assert.deepEqual(top, [90, 100]);
  assert.deepEqual(spreadLabels([30, 10], 12), [30, 10]); // input order is kept in the output
});
