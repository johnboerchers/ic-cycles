// Numbers for the energy panel (SPEC section 12), as plain data: one row per process of the
// timeline (and the two strokes when they are on), how far each row has got at a given frame,
// and the cycle totals. Signs: q > 0 is heat into the gas, w > 0 is work done by the gas,
// du = q − w. The view shows q and w as magnitudes with in/out subscripts.

import { timelineSegments } from "./model.js";

const STROKES = ["1-0", "0-1"];

// One row per non-empty timeline segment: { processId, role, label, stroke, q, w, du }, with
// the process totals.
export function energyRows(cycle, segments) {
  const { solution } = cycle;
  const P1 = solution.states["1"].P;
  const dv = solution.states["1"].v - solution.states["2"].v;
  return segments.map((s) => {
    const stroke = STROKES.includes(s.processId);
    let q, w, du;
    if (stroke) {
      // Exhaust: the piston pushes the gas out, w = −P1 (v1 − v2); intake gives it back.
      q = 0;
      w = s.processId === "1-0" ? -P1 * dv : P1 * dv;
      du = 0;
    } else {
      const p = solution.processes.find((pr) => pr.id === s.processId);
      ({ q, w } = p);
      du = q - w;
    }
    return { processId: s.processId, role: s.role, label: s.label, stroke, q, w, du };
  });
}

// The energy table of the first cycle in the model: rows, totals and the largest magnitude,
// which sets the one scale all bars share.
export function energyTable(model) {
  const rows = energyRows(model.cycles[0], timelineSegments(model));
  const cycleRows = rows.filter((r) => !r.stroke);
  const qin = cycleRows.reduce((a, r) => a + Math.max(0, r.q), 0);
  const qout = cycleRows.reduce((a, r) => a + Math.max(0, -r.q), 0);
  const sumDu = cycleRows.reduce((a, r) => a + r.du, 0);
  const max = Math.max(1e-9, ...rows.flatMap((r) => [Math.abs(r.q), Math.abs(r.w), Math.abs(r.du)]));
  return { rows, totals: { qin, qout, wnet: qin - qout, sumDu }, max };
}

// How far each row has got at a frame: "done" rows show their totals, the "current" row the
// running values from frame.energy, rows "ahead" are not reached yet. At state 1 (phase 0)
// everything is reset: the first row is current with nothing done.
export function energyProgress(rows, frame) {
  const cur = rows.findIndex((r) => r.processId === frame.processId);
  return rows.map((r, i) => {
    if (i < cur) return { status: "done", q: r.q, w: r.w, du: r.du };
    if (i === cur) return { status: "current", q: frame.energy.q, w: frame.energy.w, du: frame.energy.du };
    return { status: "ahead", q: 0, w: 0, du: 0 };
  });
}
