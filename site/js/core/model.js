// buildModel(state): everything the views draw, as plain data (BUILD_PLAN.md, "Architecture").
// The model holds a list of cycles: one in explore mode, two (A and B on one shared timeline)
// in compare mode.
//
// Also here: the playback helpers that move the playhead along the timeline, so that the
// clock in main.js stays thin and this logic is tested.

import { makeGas } from "./gas.js";
import { ratiosFor, solveCycle } from "./cycle.js";
import { sideRatios } from "./compare.js";
import { sampleProcess } from "./paths.js";
import { buildTimeline, frameAt, phaseOfSlot, slotProcesses } from "./timeline.js";
import { niceBound, niceUpper, niceLower } from "./scale.js";
import { CONTENT } from "../content/content.js";

// Process role of each timeline slot (PHYSICS.md section 6).
export const SLOT_ROLE = {
  C: "compression",
  HV: "heatAdditionV",
  HP: "heatAdditionP",
  E: "expansion",
  R: "heatRejection",
  X: "exhaust",
  I: "intake",
};

// The strokes have no process in the cycle; frames call them 1-0 and 0-1 (PHYSICS.md section 8).
const STROKE_PROCESS = { X: "1-0", I: "0-1" };

const S_LEAD = 0.05; // the T-s entropy axis starts this fraction of its span left of 0
const MIN_S_SPAN = 0.05; // kJ/kg·K, entropy span when a cycle adds no heat at all
const EPS = 1e-9;
// Log axes get more room than linear ones: 1.05 is only 2 % of a log axis, which would put the
// top of the cycle and the states at TDC against the axes.
const LOG_HEADROOM = 1.25;

// A cycle of one type from its stored (native) parameters and the shared inlet state and gas.
export function solveCycleFor(type, params, shared) {
  const gas = makeGas({ k: shared.k });
  const ratios = ratiosFor(type, params, shared.T1, gas);
  return solveCycle({ type, P1: shared.P1, T1: shared.T1, ...ratios, gas });
}

function cycleEntry(id, label, solution, timelineOptions) {
  const timeline = buildTimeline(solution, timelineOptions);
  const samples = {};
  for (const pr of solution.processes) {
    if (!pr.degenerate) samples[pr.id] = sampleProcess(solution, pr.id);
  }
  return { id, label, solution, timeline, samples };
}

// Axis bounds covering every cycle in the list. Both P–v axes and the T axis start at 0 so
// areas under the curves mean work and heat; s starts slightly left of 0 (SPEC section 6).
export function axisBounds(cycles) {
  const states = cycles.flatMap((c) => Object.values(c.solution.states));
  const max = (key) => Math.max(...states.map((st) => st[key]));
  const min = (key) => Math.min(...states.map((st) => st[key]));
  const sHi = niceBound(Math.max(max("s"), MIN_S_SPAN));
  const sLo = -Number((S_LEAD * sHi).toPrecision(12)); // -0.04, not -0.04000000000000001
  return {
    pv: { v: [0, niceBound(max("v"))], P: [0, niceBound(max("P"))] },
    // Log–log P–v (SPEC section 6): nice numbers below the minima and above the maxima.
    pvLog: {
      v: [niceLower(min("v") / LOG_HEADROOM), niceUpper(max("v") * LOG_HEADROOM)],
      P: [niceLower(min("P") / LOG_HEADROOM), niceUpper(max("P") * LOG_HEADROOM)],
    },
    ts: { s: [sLo, sHi], T: [0, niceBound(max("T"))] },
  };
}

export function buildModel(state) {
  if (state.mode === "compare") return buildCompareModel(state);
  const { cycle, shared, params, options } = state;
  const solution = solveCycleFor(cycle, params[cycle], shared);
  const cycles = [cycleEntry(cycle, CONTENT.cycles[cycle].name, solution, { strokes: options.strokes })];
  return { mode: "explore", cycles, bounds: axisBounds(cycles) };
}

// ------------------------------------------------------------------------------ compare mode

export const SIDES = ["a", "b"];

// Compare mode (SPEC section 15): cycles A and B share state 1 and k. Each side's ratios come
// from the "hold equal" choice (PHYSICS.md section 7). The two timelines are built with each
// other's slots forced, so they have identical slot boundaries and one phase drives both: in a
// slot only one cycle has, the other waits. The strokes are not shown in compare mode.
//
// `compare.sides` keeps both sides, with `solution: null` for a side whose constraint cannot be
// met; `cycles` holds only the sides that have a cycle (normally both).
export function buildCompareModel(state) {
  const { shared, compare } = state;
  const gas = makeGas({ k: shared.k });
  const sides = SIDES.map((key) => {
    const side = compare[key];
    const ratios = sideRatios(compare.constraint, compare.shared, side, shared.P1, shared.T1, gas);
    const solution = ratios && solveCycle({ type: side.type, P1: shared.P1, T1: shared.T1, ...ratios, gas });
    return { key, letter: key.toUpperCase(), type: side.type, xv: side.xv, solution };
  });
  const solved = sides.filter((s) => s.solution);
  const own = solved.map((s) => Object.keys(slotProcesses(s.solution)));
  const union = new Set(own.flat());
  const cycles = solved.map((s, i) => {
    const force = [...union].filter((id) => !own[i].includes(id));
    const label = `${s.letter}: ${CONTENT.cycles[s.type].name}`;
    return { ...cycleEntry(s.key, label, s.solution, { strokes: false, force }), side: s.letter };
  });
  return { mode: "compare", cycles, bounds: axisBounds(cycles), compare: { constraint: compare.constraint, sides } };
}

// States that get a marker and a label on the diagrams: the ends of the processes that are
// drawn, but not x where it coincides with 2 or 3 (Otto, Diesel, a dual cycle with rp = 1 or
// rc = 1).
export function labeledStates(solution) {
  const drawn = solution.processes.filter((p) => !p.degenerate);
  const ends = new Set(drawn.flatMap((p) => [p.from, p.to]));
  const xOwn = solution.processes
    .filter((p) => p.from === "x" || p.to === "x")
    .every((p) => !p.degenerate);
  return ["1", "2", "x", "3", "4"].filter((id) => ends.has(id) && (id !== "x" || xOwn));
}

// The segments of the timeline bar: one per non-empty slot of the shared timeline. In compare
// mode a slot that only one cycle has is labeled with that cycle's letter ("A 2→3"), and a slot
// both have with their process ids ("2→3" or "2→3 / 2→x").
export function timelineSegments(model) {
  const { timeline } = model.cycles[0];
  const compare = model.mode === "compare";
  return timeline.slots
    .filter((s) => s.u1 > s.u0)
    .map((s) => {
      const role = SLOT_ROLE[s.id];
      const owners = model.cycles
        .map((c) => ({ c, id: c.timeline.slots.find((x) => x.id === s.id).processId }))
        .filter((o) => o.id);
      const processId = owners[0]?.id ?? STROKE_PROCESS[s.id] ?? null;
      const arrow = (id) => id.replace("-", "→");
      let label = processId ? arrow(processId) : CONTENT.roles[role].label;
      if (compare && owners.length) {
        label = owners.length < model.cycles.length
          ? `${owners[0].c.side} ${arrow(owners[0].id)}`
          : [...new Set(owners.map((o) => arrow(o.id)))].join(" / ");
      }
      return { slot: s.id, role, processId, label, u0: s.u0, u1: s.u1, seconds: s.seconds };
    });
}

// Whether a frame is in the intake or exhaust stroke.
export const isStroke = (frame) => frame.slot === "X" || frame.slot === "I";

// ------------------------------------------------------------------------------ playback

// The cycle sampled at n evenly spaced phases, for dragging the state point (SPEC section 6):
// [{ u, state, vCyl, stroke }] for u = 0, 1/n, ... (n - 1)/n. `stroke` marks the intake and
// exhaust strokes, where P–v uses vCyl as the abscissa (PHYSICS.md section 8).
export function phaseSamples(cycle, n = 600) {
  const out = [];
  for (let j = 0; j < n; j++) {
    const f = frameAt(cycle.solution, cycle.timeline, j / n);
    out.push({ u: j / n, state: f.state, vCyl: f.vCyl, stroke: isStroke(f) });
  }
  return out;
}

// The playhead is stored as slot and tau; the phase comes from the current timeline. In
// compare mode the timelines share their slot boundaries, so the first one serves for all.
export function phaseOf(model, playback) {
  return phaseOfSlot(model.cycles[0].timeline, playback.slot, playback.tau);
}

// One frame per cycle, all at the same phase.
export function framesAt(model, phase) {
  return model.cycles.map((c) => frameAt(c.solution, c.timeline, phase));
}

// Phases at which the states are reached: the ends of the non-empty slots. The last one is
// exactly 1 (state 1 again), whatever rounding left in the slot table.
export function stateBoundaries(timeline) {
  const ends = timeline.slots.filter((s) => s.u1 > s.u0).map((s) => s.u1);
  ends[ends.length - 1] = 1;
  return ends;
}

// The first state boundary strictly after `phase`.
export function nextBoundary(timeline, phase) {
  return stateBoundaries(timeline).find((b) => b > phase + EPS) ?? 1;
}

// Target of "previous process": the start of the current process, or the start of the one
// before it when the playhead is no more than `grace` (in phase units) into the current one.
// From state 1 it wraps to the start of the last process.
export function previousStart(timeline, phase, grace) {
  const starts = timeline.slots.filter((s) => s.u1 > s.u0).map((s) => s.u0);
  let i = 0;
  while (i + 1 < starts.length && starts[i + 1] <= phase + EPS) i++;
  if (phase - starts[i] > grace) return starts[i];
  return starts[(i - 1 + starts.length) % starts.length];
}

// Moves the playhead by `seconds` of animation time and wraps at the end of the cycle. With
// `stopAt` (a state boundary ahead of the playhead) it stops exactly there; stopping at 1
// means stopping at state 1, phase 0.
export function advancePhase(timeline, phase, seconds, stopAt = null) {
  const u = phase + seconds / timeline.totalSeconds;
  if (stopAt !== null && u >= stopAt - EPS) return { phase: stopAt >= 1 ? 0 : stopAt, stopped: true };
  return { phase: u - Math.floor(u), stopped: false };
}
