// The teaching text for a gas model: CONTENT for constant specific heats, or CONTENT with
// VARIABLE merged in for air with temperature-dependent specific heats (the rules are in the
// comment above VARIABLE in content/content.js, and SPEC section 19). Pure data, no DOM.
//   model     VARIABLE's replaces CONTENT's.
//   symbols   VARIABLE's are appended to CONTENT's.
//   cycles.<type>.intro, .summary and .processes[id]: each field given in VARIABLE replaces the
//             field of the same name in that CONTENT card; fields not given keep the CONTENT text.
// Everything else (strokes, roles, compare, the cycle names and so on) is CONTENT's own.

import { CONTENT, VARIABLE } from "../content/content.js";

function mergeCycle(base, over) {
  if (!over) return base;
  const out = { ...base };
  for (const key of ["intro", "summary"]) {
    if (over[key]) out[key] = { ...base[key], ...over[key] };
  }
  if (over.processes) {
    out.processes = { ...base.processes };
    for (const [id, card] of Object.entries(over.processes)) {
      out.processes[id] = { ...base.processes[id], ...card };
    }
  }
  return out;
}

function merge() {
  const cycles = {};
  for (const type of Object.keys(CONTENT.cycles)) {
    cycles[type] = mergeCycle(CONTENT.cycles[type], VARIABLE.cycles?.[type]);
  }
  return {
    ...CONTENT,
    model: VARIABLE.model ?? CONTENT.model,
    symbols: [...CONTENT.symbols, ...(VARIABLE.symbols ?? [])],
    cycles,
  };
}

let variable = null; // built once, on first use

// `specificHeats` is state.specificHeats: "constant" (the default) or "variable".
export function contentFor(specificHeats) {
  if (specificHeats !== "variable") return CONTENT;
  if (!variable) variable = merge();
  return variable;
}
