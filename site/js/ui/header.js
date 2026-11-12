// Header: the cycle selector (Otto, Diesel, dual). The buttons are in index.html.

import { noMouseFocus } from "./dom.js";

export function createHeader(root, actions) {
  const buttons = [...root.querySelectorAll("[data-cycle]")];
  for (const b of buttons) {
    noMouseFocus(b);
    b.addEventListener("click", () => actions.selectCycle(b.dataset.cycle));
  }
  let shown = null;
  return {
    render(model, state) {
      if (shown === state.cycle) return;
      for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.cycle === state.cycle));
      shown = state.cycle;
    },
    tick() {},
  };
}
