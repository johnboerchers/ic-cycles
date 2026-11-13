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
export const LABELS = {
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
    const r = sliderRow(body, {
      id: `param-${key}`,
      label: LABELS[key],
      spec,
      onValue: (x) => actions.setParam(group, key, x),
      current: () => current(group, key),
    });
    return { group, key, ...r };
  }

  let lastState = null;
  const current = (group, key) => (group === "params" ? lastState.params[cycle][key] : lastState.shared[key]);

  function render(model, state) {
    lastState = state;
    if (state.cycle !== cycle) build(state);
    for (const r of rows) r.show(current(r.group, r.key));
    for (const c of chips) c.b.setAttribute("aria-pressed", String(Math.abs(state.shared.k - c.k) < 1e-9));
  }

  return { render, tick() {} };
}

// One parameter row: label, slider and number box (SPEC section 8), used here and in the
// compare panel. `label` is [words, symbol, subscript, unit]. While typing, a complete number
// inside the range is applied and anything else ignored; leaving the box (or Enter) clamps to
// the range. Returns { slider, num, show(x) }; show writes a value without disturbing a box
// that is being typed in.
export function sliderRow(parent, { id, label, spec, onValue, current }) {
  const [words, symbol, sub, unitText] = label;
  const el = htmlEl("div", { class: "param" }, parent);
  const lab = htmlEl("label", { for: id }, el);
  lab.append(`${words} `);
  if (symbol) symbolHtml(lab, symbol, sub);
  if (unitText) htmlEl("span", { class: "unit", text: ` (${unitText})` }, lab);
  const slider = htmlEl("input", { type: "range", min: spec.min, max: spec.max, step: spec.step }, el);
  slider.setAttribute("aria-label", `${words} slider`);
  const num = htmlEl("input", { type: "text", id, inputmode: "decimal", autocomplete: "off", spellcheck: "false", class: "num" }, el);

  slider.addEventListener("input", () => onValue(Number(slider.value)));
  num.addEventListener("input", () => {
    const x = parseNumber(num.value);
    if (x !== null && inRange(x, spec)) onValue(x);
  });
  const commit = () => {
    const x = parseNumber(num.value);
    if (x !== null) onValue(clampTo(x, spec));
    num.value = show(current());
  };
  num.addEventListener("change", commit);
  num.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { commit(); num.select(); }
    if (e.key === "Escape") { num.value = show(current()); num.blur(); }
  });

  let shown = null;
  return {
    el,
    slider,
    num,
    show(x) {
      if (shown === x) return;
      shown = x;
      slider.value = String(x);
      if (document.activeElement !== num || parseNumber(num.value) !== x) num.value = show(x);
    },
  };
}
