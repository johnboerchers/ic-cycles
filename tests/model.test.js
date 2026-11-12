import test from "node:test";
import assert from "node:assert/strict";
import {
  SLOT_ROLE, buildModel, axisBounds, labeledStates, timelineSegments, phaseOf, framesAt,
  stateBoundaries, nextBoundary, previousStart, advancePhase, solveCycleFor,
} from "../site/js/core/model.js";
import { buildTimeline, frameAt, statePhases } from "../site/js/core/timeline.js";
import { formatValue } from "../site/js/core/format.js";
import { defaultState } from "../site/js/state/defaults.js";
import { fixture, assertClose, assertDeepClose, solutionsByName } from "./helpers.js";

const EPS = 1e-12;
const stateFor = (cycle, patch = {}) => ({ ...defaultState(), cycle, ...patch });
const model = (cycle, patch) => buildModel(stateFor(cycle, patch));

test("defaults reproduce the three default fixture cycles", () => {
  for (const type of ["otto", "diesel", "dual"]) {
    const m = model(type);
    assert.equal(m.mode, "explore");
    assert.equal(m.cycles.length, 1);
    const [c] = m.cycles;
    assert.equal(c.id, type);
    const expected = fixture.cycles.find((x) => x.name === `${type}-default`);
    assertDeepClose(c.solution.states, expected.states, `${type} states`);
    assertDeepClose(c.solution.metrics, expected.metrics, `${type} metrics`);
    const tl = fixture.timelines.find((t) => t.case === `${type}-default` && !t.strokes && !t.force.length);
    assertDeepClose(c.timeline, tl.timeline, `${type} timeline`);
  }
  assert.equal(model("otto").cycles[0].label, "Otto cycle");
  assert.equal(model("dual").cycles[0].label, "Dual cycle");
});

test("samples: one polyline per drawn process, from its first state to its last", () => {
  const { solution, samples } = model("dual").cycles[0];
  assert.deepEqual(Object.keys(samples), ["1-2", "2-x", "x-3", "3-4", "4-1"]);
  assert.equal(samples["1-2"].length, 65); // isentropes: 64 intervals
  assert.equal(samples["2-x"].length, 33);
  for (const pr of solution.processes) {
    const pts = samples[pr.id];
    assertDeepClose(pts[0], { ...solution.states[pr.from], lambda: 0 }, `${pr.id} start`);
    assertDeepClose(pts[pts.length - 1], { ...solution.states[pr.to], lambda: 1 }, `${pr.id} end`);
  }
  // A dual cycle with rc = 1 has a degenerate x-3: no samples, so no curve.
  const asOtto = model("dual", { params: { ...defaultState().params, dual: { r: 16, rp: 1.5, rc: 1 } } });
  assert.deepEqual(Object.keys(asOtto.cycles[0].samples), ["1-2", "2-x", "3-4", "4-1"]);
});

test("axis bounds: nice numbers above 1.05 x the maxima, P–v and T from 0", () => {
  assert.deepEqual(model("otto").bounds, {
    pv: { v: [0, 1], P: [0, 6000] },
    pvLog: { v: [0.08, 1.2], P: [80, 8000] },
    ts: { s: [-0.04, 0.8], T: [0, 2000] },
  });
  assert.deepEqual(model("diesel").bounds.pv, { v: [0, 1], P: [0, 8000] });
  assert.deepEqual(model("dual").bounds.pv, { v: [0, 1], P: [0, 8000] });
  assert.deepEqual(model("dual").bounds.ts.T, [0, 2500]); // T3 = 2046.2
  // Bounds cover every cycle in the list (compare mode puts two there).
  const both = [...model("otto").cycles, ...model("dual").cycles];
  assert.deepEqual(axisBounds(both).pv.P, [0, 8000]);
  // A cycle with no heat added still gets an entropy axis.
  const flat = { solution: solveCycleFor("dual", { r: 16, rp: 1, rc: 1 }, defaultState().shared) };
  assert.ok(axisBounds([flat]).ts.s[1] > 0);
});

test("labeled states: x only where it is a state of its own", () => {
  assert.deepEqual(labeledStates(solutionsByName["otto-default"]), ["1", "2", "3", "4"]);
  assert.deepEqual(labeledStates(solutionsByName["diesel-default"]), ["1", "2", "3", "4"]);
  assert.deepEqual(labeledStates(solutionsByName["dual-default"]), ["1", "2", "x", "3", "4"]);
  assert.deepEqual(labeledStates(solutionsByName["dual-as-otto"]), ["1", "2", "3", "4"]);
  assert.deepEqual(labeledStates(solutionsByName["dual-as-diesel"]), ["1", "2", "3", "4"]);
});

test("timeline segments: one per non-empty slot, labeled by process, colored by role", () => {
  const labels = (m) => timelineSegments(m).map((s) => s.label);
  assert.deepEqual(labels(model("otto")), ["1→2", "2→3", "3→4", "4→1"]);
  assert.deepEqual(labels(model("diesel")), ["1→2", "2→3", "3→4", "4→1"]);
  assert.deepEqual(labels(model("dual")), ["1→2", "2→x", "x→3", "3→4", "4→1"]);
  const withStrokes = model("otto", { options: { ...defaultState().options, strokes: true } });
  assert.deepEqual(labels(withStrokes), ["1→2", "2→3", "3→4", "4→1", "1→0", "0→1"]);
  const diesel = timelineSegments(model("diesel"));
  assert.deepEqual(diesel.map((s) => s.role), ["compression", "heatAdditionP", "expansion", "heatRejection"]);
  assert.deepEqual(diesel.map((s) => s.seconds), [2.4, 1.4, 2.4, 1.4]);
  assert.equal(diesel[0].u0, 0);
  assertClose(diesel[3].u1, 1, "last segment ends at 1");
  for (let i = 1; i < diesel.length; i++) assert.equal(diesel[i].u0, diesel[i - 1].u1);
  for (const [slot, role] of Object.entries(SLOT_ROLE)) assert.ok(role, slot);
});

test("readout numbers of BUILD_PLAN.md M2 at the state phases", () => {
  const readout = (type, stateId) => {
    const m = model(type);
    const phase = statePhases(m.cycles[0].timeline)[stateId];
    const { state } = framesAt(m, phase)[0];
    return [formatValue("P", state.P), formatValue("T", state.T)];
  };
  assert.deepEqual(readout("otto", "2"), ["1838", "689.2"]);
  assert.deepEqual(readout("otto", "3"), ["4811", "1804.2"]);
  assert.deepEqual(readout("diesel", "3"), ["5720", "1906.6"]);
  assert.deepEqual(readout("otto", "1"), ["100.0", "300.0"]);
});

test("the playhead as slot and tau round-trips through the phase", () => {
  for (const type of ["otto", "diesel", "dual"]) {
    const m = model(type);
    for (let j = 0; j < 200; j++) {
      const u = j / 200;
      const [f] = framesAt(m, u);
      assertClose(phaseOf(m, { slot: f.slot, tau: f.tau }), u, `${type} u=${u}`, 1e-9);
    }
  }
});

test("switching cycles keeps slot and tau, or moves to the start of the next slot", () => {
  const otto = model("otto"), diesel = model("diesel");
  // Mid-compression in Otto is mid-compression in Diesel: same crank angle.
  const [a] = framesAt(otto, phaseOf(otto, { slot: "C", tau: 0.4 }));
  const [b] = framesAt(diesel, phaseOf(diesel, { slot: "C", tau: 0.4 }));
  assert.equal(b.slot, "C");
  assertClose(b.theta, a.theta, "crank angle");
  // Otto's constant-volume heat addition does not exist in Diesel: go to the start of HP.
  const [c] = framesAt(diesel, phaseOf(diesel, { slot: "HV", tau: 0.4 }));
  assert.equal(c.slot, "HP");
  assert.equal(c.tau, 0);
});

test("state boundaries and next boundary", () => {
  for (const type of ["otto", "diesel", "dual"]) {
    const { timeline } = model(type).cycles[0];
    const b = stateBoundaries(timeline);
    const sp = statePhases(timeline);
    const expected = type === "dual" ? [sp["2"], sp.x, sp["3"], sp["4"], 1] : [sp["2"], sp["3"], sp["4"], 1];
    assert.deepEqual(b, expected, type);
    assert.equal(nextBoundary(timeline, 0), b[0]);
    assert.equal(nextBoundary(timeline, b[0]), b[1], "from a boundary, the next one");
    assert.equal(nextBoundary(timeline, b[0] - 1e-6), b[0]);
    assert.equal(nextBoundary(timeline, b[b.length - 2] + 1e-6), 1);
  }
});

test("advancing stops exactly at a state, wraps at the end, and lands on state 1", () => {
  const m = model("otto");
  const { timeline } = m.cycles[0];
  const [b2] = stateBoundaries(timeline);
  // 1 s of animation from state 1, free running
  const free = advancePhase(timeline, 0, 1);
  assert.equal(free.stopped, false);
  assertClose(free.phase, 1 / timeline.totalSeconds, "free run");
  // With a stop at state 2, a step that would pass it ends exactly on it.
  const stop = advancePhase(timeline, b2 - 0.001, 0.1, b2);
  assert.deepEqual(stop, { phase: b2, stopped: true });
  const [at2] = framesAt(m, stop.phase);
  assert.equal(at2.slot, "HV");
  assert.equal(at2.tau, 0);
  assertDeepClose(at2.state, m.cycles[0].solution.states["2"], "state 2");
  // The last stop is state 1 at phase 0.
  assert.deepEqual(advancePhase(timeline, 0.999, 0.1, 1), { phase: 0, stopped: true });
  // Free running wraps.
  const wrapped = advancePhase(timeline, 0.99, 0.2);
  assertClose(wrapped.phase, 0.99 + 0.2 / timeline.totalSeconds - 1, "wrap");
});

test("previous process: start of this one, or of the one before near its start", () => {
  const { timeline } = model("otto").cycles[0];
  const starts = timeline.slots.filter((s) => s.u1 > s.u0).map((s) => s.u0); // 4 processes
  const grace = 0.3 / timeline.totalSeconds;
  const mid = (starts[1] + starts[2]) / 2; // middle of 2-3
  assert.equal(previousStart(timeline, mid, grace), starts[1]);
  assert.equal(previousStart(timeline, starts[1], grace), starts[0]);
  assert.equal(previousStart(timeline, starts[1] + grace / 2, grace), starts[0]);
  assert.equal(previousStart(timeline, starts[2], grace), starts[1]);
  assert.equal(previousStart(timeline, 0, grace), starts[3], "from state 1 back to 4-1");
  assert.equal(previousStart(timeline, 0.99, grace), starts[3]);
});

test("frames come one per cycle and match frameAt", () => {
  const m = model("dual");
  const [f] = framesAt(m, 0.37);
  const c = m.cycles[0];
  assertDeepClose(f, frameAt(c.solution, c.timeline, 0.37), "frame");
  assert.equal(buildTimeline(c.solution).totalSeconds, c.timeline.totalSeconds);
  assert.ok(EPS > 0);
});
