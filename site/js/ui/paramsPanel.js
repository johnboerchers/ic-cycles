// Parameters panel (SPEC section 8): one slider and one number box per parameter, the k chips
// and Reset. Changing a value updates everything at once; the playhead keeps its slot and tau.
//
// render() rebuilds the rows only when the cycle changes. Otherwise it only writes values, so a
// slider being dragged or a box being typed in keeps its focus.

import { PARAMS, SHARED, K_CHIPS } from "../state/defaults.js";
import { parseNumber, inRange, clampTo } from "../core/params.js";
import { formatValue } from "../core/format.js";
import { htmlEl, symbolHtml, noMouseFocus } from "./dom.js";

// Label of each parameter: words, symbol, subscript, unit.
const LABELS = {
  r: ["Compression ratio", "r"],
  qin: ["Heat added", "q", "in", "kJ/kg"],
  rc: ["Cutoff ratio", "r", "c"],
  rp: ["Pressure ratio", "r", "p"],
  T1: ["Inlet temperature", "T", "1", "K"],
  P1: ["Inlet pressure", "P", "1", "kPa"],
  k: ["Specific heat ratio", "k"],
};

// Values in the boxes read as typed: "8", "1.667", "800".
const show = (x) => formatValue("ratio", x);

export function createParamsPanel(container, actions) {
  const body = htmlEl("div", { class: "params" }, container);
  let cycle = null;
  let rows = [];
  let chips = [];

  function build(state) {
    body.replaceChildren();
    cycle = state.cycle;
    const fields = [
      ...Object.keys(PARAMS[cycle]).map((key) => ({ group: "params", key, spec: PARAMS[cycle][key] })),
      ...Object.keys(SHARED).map((key) => ({ group: "shared", key, spec: SHARED[key] })),
    ];
    rows = fields.map((f, i) => {
      if (f.group === "shared" && fields[i - 1]?.group === "params") htmlEl("div", { class: "params-rule", "aria-hidden": "true" }, body);
      return row(f);
    });
    chips = [];
    const chipRow = htmlEl("div", { class: "params-foot" }, body);
    symbolHtml(htmlEl("span", { class: "control-label" }, chipRow), "k").append(":");
    for (const k of K_CHIPS) {
      const b = noMouseFocus(htmlEl("button", { type: "button", class: "chip-btn", "aria-pressed": "false", text: k === 1.4 ? "1.4 (air)" : k === 1.667 ? "1.667 (monatomic)" : String(k) }, chipRow));
      b.addEventListener("click", () => actions.setParam("shared", "k", k));
      chips.push({ b, k });
    }
    const reset = noMouseFocus(htmlEl("button", { type: "button", class: "text-btn", text: "Reset" }, chipRow));
    reset.title = "Restore the default values";
    reset.addEventListener("click", actions.resetParams);
  }

  function row({ group, key, spec }) {
    const id = `param-${key}`;
    const [words, symbol, sub, unitText] = LABELS[key];
    const el = htmlEl("div", { class: "param" }, body);
    const label = htmlEl("label", { for: id }, el);
    label.append(`${words} `);
    symbolHtml(label, symbol, sub);
    if (unitText) htmlEl("span", { class: "unit", text: ` (${unitText})` }, label);
    const slider = htmlEl("input", { type: "range", min: spec.min, max: spec.max, step: spec.step, "aria-labelledby": null }, el);
    slider.setAttribute("aria-label", `${words} slider`);
    const num = htmlEl("input", { type: "text", id, inputmode: "decimal", autocomplete: "off", spellcheck: "false", class: "num" }, el);

    slider.addEventListener("input", () => actions.setParam(group, key, Number(slider.value)));
    // While typing: apply a complete number inside the range, ignore anything else.
    num.addEventListener("input", () => {
      const x = parseNumber(num.value);
      if (x !== null && inRange(x, spec)) actions.setParam(group, key, x);
    });
    // On leaving the box (or Enter): clamp to the range and show the value in use.
    const commit = () => {
      const x = parseNumber(num.value);
      if (x !== null) actions.setParam(group, key, clampTo(x, spec));
      num.value = show(current(group, key));
    };
    num.addEventListener("change", commit);
    num.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { commit(); num.select(); }
      if (e.key === "Escape") { num.value = show(current(group, key)); num.blur(); }
    });
    return { group, key, slider, num, value: null };
  }

  let lastState = null;
  const current = (group, key) => (group === "params" ? lastState.params[cycle][key] : lastState.shared[key]);

  function render(model, state) {
    lastState = state;
    if (state.cycle !== cycle) build(state);
    for (const r of rows) {
      const x = current(r.group, r.key);
      if (r.value === x) continue;
      r.value = x;
      r.slider.value = String(x);
      // Leave the box alone while it is being typed in and already means this value.
      if (document.activeElement !== r.num || parseNumber(r.num.value) !== x) r.num.value = show(x);
    }
    for (const c of chips) c.b.setAttribute("aria-pressed", String(Math.abs(state.shared.k - c.k) < 1e-9));
  }

  return { render, tick() {} };
}
