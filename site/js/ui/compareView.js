// Compare mode panels (SPEC section 15).
//   Controls (this view's container): a type selector for cycles A and B, the "Hold equal"
//   choice, and sliders for whatever is free: the shared r and q_in, or P_max and q_in, a heat
//   split for a dual side, or each side's own parameters when nothing is held equal.
//   Results (deps.results): a side-by-side table with the better efficiency marked, a note in
//   place of a side whose constraint cannot be met, and the takeaway from CONTENT.compare.
//
// render() rebuilds the sliders only when the set of sliders changes, so a slider being dragged
// keeps its focus; otherwise it only writes values.

import { PARAMS, COMPARE, CYCLES } from "../state/defaults.js";
import { formatValue } from "../core/format.js";
import { resultValues } from "../core/tables.js";
import { SIDES } from "../core/model.js";
import { CONTENT } from "../content/content.js";
import { htmlEl, symbolHtml } from "./dom.js";
import { sliderRow, LABELS } from "./paramsPanel.js";
import { renderProse } from "./math.js";

const CONSTRAINTS = ["same-r-qin", "same-pmax-qin", "independent"];

const COMPARE_LABELS = {
  r: LABELS.r,
  qin: LABELS.qin,
  Pmax: ["Peak pressure", "P", "max", "kPa"],
  xv: ["Fraction of heat at constant volume"],
};

// Rows of the results table: label parts, how to read the value, its quantity for formatting.
const ROWS = [
  { label: ["Compression ratio", "r"], get: (s) => s.inputs.r, q: "ratio" },
  { label: ["Pressure ratio", "r", "p"], get: (s) => s.inputs.rp, q: "ratio" },
  { label: ["Cutoff ratio", "r", "c"], get: (s) => s.inputs.rc, q: "ratio" },
  { label: ["Heat added", "q", "in"], get: (s) => resultValues(s).qin, q: "q", unit: "kJ/kg" },
  { label: ["Heat rejected", "q", "out"], get: (s) => resultValues(s).qout, q: "q", unit: "kJ/kg" },
  { label: ["Net work", "w", "net"], get: (s) => resultValues(s).wnet, q: "w", unit: "kJ/kg" },
  { label: ["Thermal efficiency", "η", "th"], get: (s) => resultValues(s).eta, q: "eta", eta: true },
  { label: ["MEP"], get: (s) => resultValues(s).mep, q: "mep", unit: "kPa" },
  { label: ["Peak temperature", "T", "max"], get: (s) => resultValues(s).Tmax, q: "T", unit: "K" },
  { label: ["Peak pressure", "P", "max"], get: (s) => resultValues(s).Pmax, q: "P", unit: "kPa" },
];

const cycleName = (type) => CONTENT.cycles[type].name.replace(" cycle", "");

export function createCompareView(container, { actions, results }) {
  // ---------------------------------------------------------------- controls
  const body = htmlEl("div", { class: "compare-controls" }, container);

  const types = htmlEl("div", { class: "compare-types" }, body);
  const selects = {};
  for (const key of SIDES) {
    const id = `compare-type-${key}`;
    const wrap = htmlEl("div", { class: "compare-type" }, types);
    const label = htmlEl("label", { for: id }, wrap);
    htmlEl("span", { class: `side-swatch ${key}`, "aria-hidden": "true" }, label);
    label.append(`Cycle ${key.toUpperCase()}`);
    const sel = htmlEl("select", { id }, wrap);
    for (const type of CYCLES) htmlEl("option", { value: type, text: cycleName(type) }, sel);
    sel.addEventListener("change", () => actions.setCompareType(key, sel.value));
    selects[key] = sel;
  }

  const hold = htmlEl("fieldset", { class: "compare-hold" }, body);
  htmlEl("legend", { class: "control-label", text: "Hold equal" }, hold);
  const radios = {};
  for (const c of CONSTRAINTS) {
    const label = htmlEl("label", { class: "radio" }, hold);
    const input = htmlEl("input", { type: "radio", name: "compare-hold", value: c }, label);
    label.append(CONTENT.compare[c].label);
    input.addEventListener("change", () => input.checked && actions.setCompareConstraint(c));
    radios[c] = input;
  }

  const sliders = htmlEl("div", { class: "params compare-sliders" }, body);
  let layout = null; // the key of the slider set on screen
  let rows = [];
  let lastState = null;

  // The sliders that are free under the current choice: [{ heading?, id, label, spec, get, set }].
  function freeSliders(state) {
    const { constraint } = state.compare;
    const out = [];
    if (constraint !== "independent") {
      const first = constraint === "same-r-qin" ? "r" : "Pmax";
      for (const k of [first, "qin"]) {
        out.push({ id: `cmp-${k}`, label: COMPARE_LABELS[k], spec: COMPARE[k], get: (s) => s.compare.shared[k], set: (x) => actions.setCompareShared(k, x) });
      }
      for (const key of SIDES) {
        if (state.compare[key].type !== "dual") continue;
        out.push({
          heading: `Cycle ${key.toUpperCase()} (dual)`,
          id: `cmp-${key}-xv`,
          label: COMPARE_LABELS.xv,
          spec: COMPARE.xv,
          get: (s) => s.compare[key].xv,
          set: (x) => actions.setCompareXv(key, x),
        });
      }
      return out;
    }
    for (const key of SIDES) {
      const type = state.compare[key].type;
      Object.keys(PARAMS[type]).forEach((p, i) => {
        out.push({
          heading: i === 0 ? `Cycle ${key.toUpperCase()} (${cycleName(type)})` : null,
          id: `cmp-${key}-${p}`,
          label: LABELS[p],
          spec: PARAMS[type][p],
          get: (s) => s.compare[key].params[p],
          set: (x) => actions.setCompareParam(key, p, x),
        });
      });
    }
    return out;
  }

  function buildSliders(list) {
    sliders.replaceChildren();
    rows = list.map((f) => {
      if (f.heading) htmlEl("div", { class: "compare-heading", text: f.heading }, sliders);
      const r = sliderRow(sliders, { id: f.id, label: f.label, spec: f.spec, onValue: f.set, current: () => f.get(lastState) });
      return { ...r, get: f.get };
    });
  }

  // ---------------------------------------------------------------- results
  const resBody = htmlEl("div", { class: "compare-results" }, results);
  const notes = htmlEl("div", { class: "compare-notes" }, resBody);
  const table = htmlEl("table", { class: "compare-table" }, resBody);
  const head = htmlEl("tr", {}, htmlEl("thead", {}, table));
  htmlEl("th", { scope: "col", class: "q", text: "" }, head);
  const headCells = SIDES.map((key) => {
    const th = htmlEl("th", { scope: "col" }, head);
    htmlEl("span", { class: `side-swatch ${key}`, "aria-hidden": "true" }, th);
    const name = htmlEl("span", {}, th);
    return name;
  });
  htmlEl("th", { scope: "col", class: "unit-col", text: "" }, head);
  const tbody = htmlEl("tbody", {}, table);
  const cells = ROWS.map((row) => {
    const tr = htmlEl("tr", { class: row.eta ? "eta-row" : null }, tbody);
    const th = htmlEl("th", { scope: "row" }, tr);
    const [words, sym, sub] = row.label;
    th.append(sym ? `${words} ` : words);
    if (sym) symbolHtml(th, sym, sub);
    const tds = SIDES.map(() => htmlEl("td", {}, tr));
    htmlEl("td", { class: "unit-col", text: row.unit ?? "" }, tr);
    return { row, tds };
  });
  const takeaway = htmlEl("p", { class: "compare-takeaway" }, resBody);
  let takeawayShown = null;

  function renderResults(model, state) {
    const sides = model.compare.sides;
    sides.forEach((s, i) => (headCells[i].textContent = `${s.letter}: ${cycleName(s.type)}`));
    // A side whose constraint cannot be met: say so in place of its results.
    notes.replaceChildren();
    for (const s of sides) {
      if (s.solution) continue;
      htmlEl("p", { class: "compare-note", text: `Cycle ${s.letter}: no ${cycleName(s.type)} cycle reaches this peak pressure; the pressure is too low for this heat input.` }, notes);
    }
    const etas = sides.map((s) => (s.solution ? resultValues(s.solution).eta : NaN));
    const better = Number.isFinite(etas[0]) && Number.isFinite(etas[1]) && Math.abs(etas[0] - etas[1]) > 5e-4
      ? (etas[0] > etas[1] ? 0 : 1)
      : -1;
    for (const { row, tds } of cells) {
      tds.forEach((td, i) => {
        const s = sides[i].solution;
        td.replaceChildren(s ? formatValue(row.q, row.get(s)) : "—");
        td.classList.toggle("better", Boolean(row.eta && i === better));
        if (row.eta && i === better) htmlEl("span", { class: "better-tag", text: "higher" }, td);
      });
    }
    if (takeawayShown !== state.compare.constraint) {
      takeaway.replaceChildren();
      renderProse(takeaway, CONTENT.compare[state.compare.constraint].takeaway);
      takeawayShown = state.compare.constraint;
    }
  }

  function render(model, state) {
    lastState = state;
    if (model.mode !== "compare") return;
    for (const key of SIDES) selects[key].value = state.compare[key].type;
    for (const c of CONSTRAINTS) radios[c].checked = state.compare.constraint === c;
    const list = freeSliders(state);
    const key = list.map((f) => f.id).join(" ");
    if (key !== layout) {
      buildSliders(list);
      layout = key;
    }
    for (const r of rows) r.show(r.get(state));
    renderResults(model, state);
  }

  return { render, tick() {} };
}
