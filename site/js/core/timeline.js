// The timeline that drives the animation (PHYSICS.md sections 6 and 8).
// One number, the phase u in [0, 1), selects a slot (one process per slot), a fraction tau
// of that slot, and from those the crank angle and the gas state.

import { pointOnProcess, energyAlong } from "./paths.js";
import { xhat, thetaFromXhat, smoothstep } from "./kinematics.js";

const STROKE_SECONDS = 2.4; // one piston stroke at 1x
const DWELL_SECONDS = 1.4; // a process with the piston at rest, and constant-pressure heat addition

export const SLOT_ORDER = ["C", "HV", "HP", "E", "R", "X", "I"];
export const SLOT_SECONDS = {
  C: STROKE_SECONDS,
  HV: DWELL_SECONDS,
  HP: DWELL_SECONDS,
  E: STROKE_SECONDS,
  R: DWELL_SECONDS,
  X: STROKE_SECONDS,
  I: STROKE_SECONDS,
};

const ROLE_SLOT = {
  compression: "C",
  heatAdditionV: "HV",
  heatAdditionP: "HP",
  expansion: "E",
  heatRejection: "R",
};

const STROKE_ROLES = { "1-0": "exhaust", "0-1": "intake" };
const VALVE_RAMP = 0.12; // fraction of a stroke over which a valve opens or closes

// Slot id -> process id, for the non-degenerate processes of this cycle.
export function slotProcesses(solution) {
  const out = {};
  for (const pr of solution.processes) if (!pr.degenerate) out[ROLE_SLOT[pr.role]] = pr.id;
  return out;
}

// All seven slots in order, empty ones included. `force` lists slots this cycle lacks but
// must wait through because the other cycle in a comparison has them.
export function buildTimeline(solution, { strokes = false, force = [] } = {}) {
  const own = slotProcesses(solution);
  const slots = [];
  let t = 0;
  for (const id of SLOT_ORDER) {
    const on = id === "X" || id === "I" ? strokes : id in own || force.includes(id);
    const seconds = on ? SLOT_SECONDS[id] : 0;
    slots.push({ id, processId: own[id] ?? null, seconds, t0: t });
    t += seconds;
  }
  for (const s of slots) {
    s.u0 = s.t0 / t;
    s.u1 = s.u0 + s.seconds / t;
    delete s.t0;
  }
  return { slots, totalSeconds: t };
}

function wrapPhase(u) {
  const w = u - Math.floor(u);
  return w >= 1 ? 0 : w;
}

// The non-empty slot containing u. Slots are half-open, [u0, u1); taking the last slot that
// starts at or before u also covers a one-ulp mismatch between one slot's u1 and the next u0.
function slotAt(timeline, u) {
  let found = null;
  for (const s of timeline.slots) if (s.u1 > s.u0 && s.u0 <= u) found = s;
  return found;
}

function roleOf(solution, processId) {
  return STROKE_ROLES[processId] ?? solution.processes.find((p) => p.id === processId).role;
}

export function frameAt(solution, timeline, phase) {
  const st = solution.states;
  const v1 = st["1"].v, v2 = st["2"].v, v3 = st["3"].v;
  const own = slotProcesses(solution);
  const theta3 = "HP" in own ? thetaFromXhat((v3 - v2) / (v1 - v2)) : 0;

  const u = wrapPhase(phase);
  const slot = slotAt(timeline, u);
  const sid = slot.id;
  const tau = Math.min(1, (u - slot.u0) / (slot.u1 - slot.u0));
  let waiting = false;
  let theta, xh, processId, lambda, state;

  if (sid === "C") {
    theta = Math.PI + tau * Math.PI;
    xh = xhat(theta);
    processId = "1-2";
    lambda = 1 - xh;
    state = pointOnProcess(solution, processId, lambda);
  } else if (sid === "HV") {
    theta = 0;
    xh = 0;
    if ("HV" in own) {
      processId = own.HV;
      lambda = smoothstep(tau);
      state = pointOnProcess(solution, processId, lambda);
    } else {
      // forced slot: wait at state 2, the end of compression
      processId = "1-2";
      lambda = 1;
      state = { ...st["2"] };
      waiting = true;
    }
  } else if (sid === "HP") {
    if ("HP" in own) {
      theta = tau * theta3;
      xh = xhat(theta);
      processId = own.HP;
      lambda = (v2 + (v1 - v2) * xh - v2) / (v3 - v2);
      state = pointOnProcess(solution, processId, lambda);
    } else {
      // forced slot: wait at state 3, the end of whatever came before
      theta = 0;
      xh = 0;
      processId = own.HV ?? "1-2";
      lambda = 1;
      state = { ...st["3"] };
      waiting = true;
    }
  } else if (sid === "E") {
    theta = theta3 + tau * (Math.PI - theta3);
    xh = xhat(theta);
    processId = "3-4";
    lambda = (v2 + (v1 - v2) * xh - v3) / (v1 - v3);
    state = pointOnProcess(solution, processId, lambda);
  } else if (sid === "R") {
    theta = Math.PI;
    xh = 1;
    processId = "4-1";
    lambda = smoothstep(tau);
    state = pointOnProcess(solution, processId, lambda);
  } else if (sid === "X") {
    // exhaust stroke: gas stays at state 1, only its amount changes
    theta = Math.PI + tau * Math.PI;
    xh = xhat(theta);
    processId = "1-0";
    lambda = 1 - xh;
    state = { ...st["1"] };
  } else {
    // "I", intake stroke
    theta = tau * Math.PI;
    xh = xhat(theta);
    processId = "0-1";
    lambda = xh;
    state = { ...st["1"] };
  }

  const vCyl = v2 + (v1 - v2) * xh;
  const stroke = sid === "X" || sid === "I";
  let energy;
  if (stroke) {
    const dv = sid === "X" ? vCyl - v1 : vCyl - v2;
    energy = { q: 0, w: st["1"].P * dv, du: 0 };
  } else {
    energy = energyAlong(solution, processId, state);
  }

  const glow = 0.35 + 0.65 * Math.sin(Math.PI * tau);
  const lift = Math.min(1, tau / VALVE_RAMP, (1 - tau) / VALVE_RAMP);
  let workSign = 0;
  if (sid === "C" || sid === "X") workSign = -1;
  else if (sid === "E" || sid === "I" || (sid === "HP" && !waiting)) workSign = 1;

  return {
    phase: u,
    slot: sid,
    tau,
    processId,
    lambda,
    role: roleOf(solution, processId),
    state,
    theta,
    xhat: xh,
    vCyl,
    massFraction: stroke ? vCyl / v1 : 1,
    waiting,
    energy,
    heatIn: (sid === "HV" || sid === "HP") && !waiting ? glow : 0,
    heatOut: sid === "R" ? glow : 0,
    workSign,
    valves: { intake: sid === "I" ? lift : 0, exhaust: sid === "X" ? lift : 0 },
  };
}

// Phase at which the cycle reaches each state: the slot boundaries.
export function statePhases(timeline) {
  const s = Object.fromEntries(timeline.slots.map((x) => [x.id, x]));
  const out = { 1: 0, 2: s.C.u1, x: s.HV.u1, 3: s.HP.u1, 4: s.E.u1, "1end": s.R.u1 };
  if (s.X.seconds > 0) out["0"] = s.X.u1;
  return out;
}

// Phase for a slot and a fraction tau of it. A slot this timeline does not have maps to the
// start of the next slot that does, which is where the empty slot sits.
export function phaseOfSlot(timeline, slotId, tau) {
  const slot = timeline.slots.find((s) => s.id === slotId);
  if (!slot) return 0;
  if (slot.u1 <= slot.u0) return wrapPhase(slot.u0);
  return wrapPhase(slot.u0 + tau * (slot.u1 - slot.u0));
}
