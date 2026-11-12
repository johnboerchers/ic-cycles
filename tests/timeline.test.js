import test from "node:test";
import assert from "node:assert/strict";
import {
  SLOT_ORDER, SLOT_SECONDS, slotProcesses, buildTimeline, frameAt, statePhases, phaseOfSlot,
} from "../site/js/core/timeline.js";
import { fixture, assertClose, assertDeepClose, solutionsByName } from "./helpers.js";

const EPS = 1e-12;
const cases = fixture.timelines.map((t) => {
  const solution = solutionsByName[t.case];
  const timeline = buildTimeline(solution, { strokes: t.strokes, force: t.force });
  const label = `${t.case}${t.strokes ? " strokes" : ""}${t.force.length ? ` force ${t.force}` : ""}`;
  return { t, solution, timeline, label };
});
const live = (timeline) => timeline.slots.filter((s) => s.seconds > 0);

test("slot constants", () => {
  assert.deepEqual(SLOT_ORDER, ["C", "HV", "HP", "E", "R", "X", "I"]);
  assert.deepEqual(SLOT_SECONDS, { C: 2.4, HV: 1.4, HP: 1.4, E: 2.4, R: 1.4, X: 2.4, I: 2.4 });
  assert.deepEqual(slotProcesses(solutionsByName["dual-as-diesel"]), { C: "1-2", HP: "x-3", E: "3-4", R: "4-1" });
});

test("every fixture timeline: slot table, state phases and every frame", () => {
  assert.equal(cases.length, 9);
  for (const { t, solution, timeline, label } of cases) {
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

test("required 5: continuity across every slot boundary, including the wrap", () => {
  for (const { solution, timeline, label } of cases) {
    const slots = live(timeline);
    slots.forEach((s, i) => {
      const next = slots[(i + 1) % slots.length];
      const before = frameAt(solution, timeline, s.u1 - EPS);
      const after = frameAt(solution, timeline, next.u0 + EPS);
      assert.equal(before.slot, s.id, `${label}: before ${s.id}`);
      assert.equal(after.slot, next.id, `${label}: after ${s.id}`);
      for (const key of ["P", "T", "v"]) {
        assertClose(after.state[key], before.state[key], `${label} ${s.id}→${next.id} ${key}`);
      }
      assert.ok(Math.abs(after.xhat - before.xhat) <= 1e-9, `${label} ${s.id}→${next.id} xhat`);
      assert.ok(Math.abs(after.vCyl - before.vCyl) <= 1e-9 * before.vCyl, `${label} ${s.id}→${next.id} vCyl`);
    });
  }
});

test("required 5: phase 0 is state 1, and frameAt(statePhases[n]) is state n", () => {
  for (const { solution, timeline, label } of cases) {
    const phases = statePhases(timeline);
    for (const [n, u] of Object.entries(phases)) {
      const f = frameAt(solution, timeline, u);
      const id = n === "1end" || n === "0" ? "1" : n;
      for (const key of ["P", "T", "v", "s"]) {
        const want = solution.states[id][key];
        if (want === 0) assert.ok(Math.abs(f.state[key]) <= 1e-9, `${label} state ${n} ${key}`);
        else assertClose(f.state[key], want, `${label} state ${n} ${key}`);
      }
      // state 0: gas at state 1 squeezed to the clearance volume at TDC
      if (n === "0") {
        assert.equal(f.xhat, 0, `${label} state 0 at TDC`);
        assertClose(f.vCyl, solution.states["2"].v, `${label} state 0 volume`);
      }
    }
    const f0 = frameAt(solution, timeline, 0);
    assert.equal(f0.slot, "C");
    assert.equal(f0.xhat, 1);
    assertDeepClose(f0.state, solution.states["1"], `${label} phase 0`);
  }
});

test("required 6: monotonic piston", () => {
  const N = 50;
  const direction = { C: -1, X: -1, HP: 1, E: 1, I: 1 };
  for (const { solution, timeline, label } of cases) {
    for (const s of live(timeline)) {
      const xs = [];
      for (let i = 0; i < N; i++) xs.push(frameAt(solution, timeline, phaseOfSlot(timeline, s.id, i / N)));
      const waiting = xs[0].waiting;
      xs.forEach((f) => assert.equal(f.waiting, waiting, `${label} ${s.id} waiting throughout`));
      if (waiting || !(s.id in direction)) {
        xs.forEach((f) => assert.equal(f.xhat, s.id === "R" ? 1 : 0, `${label} ${s.id} piston at rest`));
        continue;
      }
      for (let i = 1; i < N; i++) {
        const d = (xs[i].xhat - xs[i - 1].xhat) * direction[s.id];
        assert.ok(d > 0, `${label} ${s.id}: xhat not monotonic at ${i}`);
      }
    }
  }
});

test("required 8: phaseOfSlot round-trips with frameAt", () => {
  for (const { solution, timeline, label } of cases) {
    for (const s of live(timeline)) {
      for (const tau of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999]) {
        const f = frameAt(solution, timeline, phaseOfSlot(timeline, s.id, tau));
        assert.equal(f.slot, s.id, `${label} ${s.id} τ=${tau}`);
        assert.ok(Math.abs(f.tau - tau) <= 1e-9, `${label} ${s.id} τ=${tau}: got ${f.tau}`);
      }
    }
  }
});

test("phaseOfSlot: a slot the timeline lacks goes to the start of the next one that exists", () => {
  const otto = cases[0];
  assert.equal(phaseOfSlot(otto.timeline, "HP", 0.4), phaseOfSlot(otto.timeline, "E", 0));
  assert.equal(phaseOfSlot(otto.timeline, "X", 0.4), 0); // strokes off: wraps to C
  const diesel = cases[1];
  assert.equal(frameAt(diesel.solution, diesel.timeline, phaseOfSlot(diesel.timeline, "HV", 0.7)).slot, "HP");
});

test("frameAt wraps the phase", () => {
  const { solution, timeline } = cases[0];
  for (const u of [0.1, 0.37, 0.9]) {
    assertDeepClose(frameAt(solution, timeline, u + 1), frameAt(solution, timeline, u), `u=${u}+1`);
    assertDeepClose(frameAt(solution, timeline, u - 1), frameAt(solution, timeline, u), `u=${u}-1`);
  }
  assert.equal(frameAt(solution, timeline, 1).phase, 0);
});

test("drawing fields: role, heat glow, work sign, valves, mass fraction", () => {
  const sweep = ({ solution, timeline }) => {
    const out = [];
    for (let i = 0; i < 400; i++) out.push(frameAt(solution, timeline, (i + 0.5) / 400));
    return out;
  };
  const roles = { C: "compression", E: "expansion", R: "heatRejection", X: "exhaust", I: "intake" };
  const sign = { C: -1, X: -1, HP: 1, E: 1, I: 1, HV: 0, R: 0 };
  for (const c of cases) {
    for (const f of sweep(c)) {
      const where = `${c.label} ${f.slot} τ=${f.tau}`;
      const roleOfProcess = c.solution.processes.find((p) => p.id === f.processId)?.role;
      assert.equal(f.role, roles[f.slot] ?? roleOfProcess, `${where} role`);
      const glow = 0.35 + 0.65 * Math.sin(Math.PI * f.tau);
      const adding = (f.slot === "HV" || f.slot === "HP") && !f.waiting;
      assertClose(f.heatIn, adding ? glow : 0, `${where} heatIn`);
      assertClose(f.heatOut, f.slot === "R" ? glow : 0, `${where} heatOut`);
      assert.equal(f.workSign, f.waiting ? 0 : sign[f.slot], `${where} workSign`);
      const lift = Math.min(1, f.tau / 0.12, (1 - f.tau) / 0.12);
      assertClose(f.valves.exhaust, f.slot === "X" ? lift : 0, `${where} exhaust valve`);
      assertClose(f.valves.intake, f.slot === "I" ? lift : 0, `${where} intake valve`);
      const stroke = f.slot === "X" || f.slot === "I";
      assertClose(f.massFraction, stroke ? f.vCyl / c.solution.states["1"].v : 1, `${where} massFraction`);
      if (f.waiting) assert.equal(f.theta, 0, `${where} waits at TDC`);
      // the piston and the gas agree: vCyl is the gas volume outside the strokes
      if (!stroke) assertClose(f.vCyl, f.state.v, `${where} vCyl = v`);
    }
  }
});

test("strokes: the two stroke works cancel", () => {
  const c = cases[3];
  const { timeline, solution } = c;
  const end = (slot) => frameAt(solution, timeline, phaseOfSlot(timeline, slot, 1 - 1e-12)).energy.w;
  const st = solution.states;
  const pdv = st["1"].P * (st["1"].v - st["2"].v);
  assertClose(end("X"), -pdv, "exhaust work");
  assertClose(end("I"), pdv, "intake work");
});
