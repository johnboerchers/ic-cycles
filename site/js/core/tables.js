// Numbers for the state table, the results panel and the diagram tooltips (SPEC sections 6, 9
// and 11), as plain data. Formatting happens in the views through core/format.js.

import { labeledStates } from "./model.js";

const EPS = 1e-9;

// Whether the cycle adds any heat. A dual cycle with rp = rc = 1 does not: its results are "—".
export const addsHeat = (solution) => Number.isFinite(solution.metrics.eta);

// One row of the state table for a gas state: P, T, v, u − u1 and s − s1.
export function stateRow(solution, st) {
  const T1 = solution.states["1"].T;
  return { P: st.P, T: st.T, v: st.v, du: solution.gas.cv * (st.T - T1), s: st.s };
}

// Rows for the distinct states, in cycle order: x only where it is a state of its own.
export function stateRows(solution) {
  return labeledStates(solution).map((id) => ({ id, ...stateRow(solution, solution.states[id]) }));
}

// The state shown in place of `id`: x stands for 2 or 3 where it coincides with one of them.
function shownState(solution, id) {
  if (id !== "x" || labeledStates(solution).includes("x")) return id;
  const toX = solution.processes.find((p) => p.to === "x");
  return toX && toX.degenerate ? "2" : "3";
}

// The two states at the ends of the process a frame is in (the rows to highlight). During the
// intake and exhaust strokes the gas stays at state 1.
export function activeStates(solution, frame) {
  const pr = solution.processes.find((p) => p.id === frame.processId);
  if (!pr) return ["1"];
  return [shownState(solution, pr.from), shownState(solution, pr.to)];
}

// Heat and work of a process as magnitudes with in/out subscripts (Çengel & Boles):
// { q: { sub: "in" | "out" | null, value }, w: { ... } }. sub is null when the value is zero.
export function energyTerms(process) {
  const term = (x, positive) => {
    if (Math.abs(x) < EPS) return { sub: null, value: 0 };
    return { sub: x > 0 ? positive : positive === "in" ? "out" : "in", value: Math.abs(x) };
  };
  // q > 0 is heat into the gas; w > 0 is work done by the gas, so it is work out.
  return { q: term(process.q, "in"), w: term(process.w, "out") };
}

// The results panel. Everything is NaN when no heat is added, so it reads "—".
export function resultValues(solution) {
  const m = solution.metrics;
  const ok = addsHeat(solution);
  const v = (x) => (ok ? x : NaN);
  return {
    heatAdded: ok,
    eta: v(m.eta),
    etaCarnot: v(m.etaCarnot),
    wnet: v(m.wnet),
    qin: v(m.qin),
    qout: v(m.qout),
    mep: v(m.mep),
    Tmax: v(m.Tmax),
    Pmax: v(m.Pmax),
    rp: solution.inputs.rp,
  };
}
