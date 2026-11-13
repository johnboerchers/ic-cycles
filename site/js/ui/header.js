// Header: the cycle selector (Otto, Diesel, dual), the Explore/Compare switch, and at the right
// Symbols, Model, Focus and the theme toggle. The buttons are in index.html. The page's mode is
// also written to <body data-mode>, which the stylesheet uses to show the panels of that mode;
// focus view is <body class="focus">, and a theme chosen with the toggle is <html data-theme>.

import { noMouseFocus } from "./dom.js";

// The OS setting, which the page follows until the toggle is used.
export const darkQuery = matchMedia("(prefers-color-scheme: dark)");
export const isDark = (theme) => theme === "dark" || (theme === "auto" && darkQuery.matches);

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
  const focusBtn = noMouseFocus(document.getElementById("focus-btn"));
  focusBtn.addEventListener("click", actions.toggleFocus);
  const themeBtn = noMouseFocus(document.getElementById("theme-btn"));
  themeBtn.addEventListener("click", actions.toggleTheme);

  let shown = null;
  return {
    render(model, state) {
      const { focus, theme } = state.options;
      const dark = isDark(theme);
      const key = `${state.cycle} ${state.mode} ${focus} ${theme} ${dark}`;
      if (shown === key) return;
      const compare = state.mode === "compare";
      // In compare mode each side chooses its own type, so the cycle selector is disabled.
      for (const b of buttons) {
        b.setAttribute("aria-pressed", String(!compare && b.dataset.cycle === state.cycle));
        b.disabled = compare;
      }
      for (const b of modeButtons) b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode));
      document.body.dataset.mode = state.mode;
      document.body.classList.toggle("focus", focus);
      focusBtn.setAttribute("aria-pressed", String(focus));
      if (theme === "auto") delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = theme;
      themeBtn.setAttribute("aria-pressed", String(dark));
      shown = key;
    },
    tick() {},
  };
}
