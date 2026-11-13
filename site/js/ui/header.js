// Header: the cycle selector (Otto, Diesel, dual) and the Explore/Compare switch. The buttons
// are in index.html. The page's mode is also written to <body data-mode>, which the stylesheet
// uses to show the panels of that mode.

import { noMouseFocus } from "./dom.js";

export function createHeader(root, actions) {
  const buttons = [...root.querySelectorAll("[data-cycle]")];
  for (const b of buttons) {
    noMouseFocus(b);
    b.addEventListener("click", () => actions.selectCycle(b.dataset.cycle));
  }
  const modeButtons = [...document.querySelectorAll("#mode-select [data-mode]")];
  for (const b of modeButtons) {
    noMouseFocus(b);
    b.addEventListener("click", () => actions.setMode(b.dataset.mode));
  }
  let shown = null;
  return {
    render(model, state) {
      const key = `${state.cycle} ${state.mode}`;
      if (shown === key) return;
      const compare = state.mode === "compare";
      // In compare mode each side chooses its own type, so the cycle selector is disabled.
      for (const b of buttons) {
        b.setAttribute("aria-pressed", String(!compare && b.dataset.cycle === state.cycle));
        b.disabled = compare;
      }
      for (const b of modeButtons) b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode));
      document.body.dataset.mode = state.mode;
      shown = key;
    },
    tick() {},
  };
}
