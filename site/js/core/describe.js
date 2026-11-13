// One-sentence text alternatives for the SVG views (SPEC section 17), for example
// "Otto cycle, process 1 to 2, isentropic compression, 40 % complete". Pure, so it is tested.

import { CONTENT } from "../content/content.js";
import { formatValue } from "./format.js";

// Where one cycle is in its timeline. A cycle waiting through a slot only the other one has
// (compare mode) says so instead.
export function describeFrame(cycle, frame) {
  if (frame.waiting) return `${cycle.label}, waiting at state ${frame.processId.split("-")[1]}`;
  const process = frame.processId.replace("-", " to ");
  const role = CONTENT.roles[frame.role].label.toLowerCase();
  return `${cycle.label}, process ${process}, ${role}, ${Math.round(100 * frame.tau)} % complete`;
}

// The cycle positions of every cycle in the model, joined into one sentence.
export function describeFrames(model, frames) {
  return model.cycles.map((c, i) => describeFrame(c, frames[i])).join("; ");
}

// The state as numbers, for the engine and the diagrams: "P = 1838 kPa, T = 689.2 K".
export function describeState(state, quantities) {
  const units = { P: "kPa", T: "K", v: "m³/kg", s: "kJ/kg·K" };
  return quantities.map((q) => `${q} = ${formatValue(q, state[q])} ${units[q]}`).join(", ");
}
