// State table (SPEC section 11): one row per distinct state and a live row for the moving
// point. Columns P, T, v, u − u1, s − s1. The two rows at the ends of the current process are
// highlighted. render builds the rows; tick only rewrites the live row and the highlight.

import { stateRows, stateRow, activeStates } from "../core/tables.js";
import { formatValue } from "../core/format.js";
import { htmlEl, symbolHtml } from "./dom.js";

const COLUMNS = [
  { key: "P", head: [["P"]], unit: "kPa", q: "P" },
  { key: "T", head: [["T"]], unit: "K", q: "T" },
  { key: "v", head: [["v"]], unit: "m³/kg", q: "v" },
  { key: "du", head: [["u"], " − ", ["u", "1"]], unit: "kJ/kg", q: "u" },
  { key: "s", head: [["s"], " − ", ["s", "1"]], unit: "kJ/kg·K", q: "s" },
];

export function createStateTable(container) {
  const table = htmlEl("table", { class: "state-table" }, container);
  const thead = htmlEl("thead", {}, table);
  const hr = htmlEl("tr", {}, thead);
  htmlEl("th", { scope: "col", class: "state-col", text: "State" }, hr);
  for (const c of COLUMNS) {
    const th = htmlEl("th", { scope: "col" }, hr);
    for (const part of c.head) {
      if (typeof part === "string") th.append(part);
      else symbolHtml(th, ...part);
    }
    htmlEl("span", { class: "unit", text: c.unit }, th);
  }
  const tbody = htmlEl("tbody", {}, table);

  let solution = null;
  let rows = []; // { id, tr }
  let live = null;
  let active = "";

  function render(model) {
    solution = model.cycles[0].solution;
    tbody.replaceChildren();
    rows = stateRows(solution).map((r) => {
      const tr = htmlEl("tr", {}, tbody);
      htmlEl("th", { scope: "row", class: "state-col", text: r.id }, tr);
      for (const c of COLUMNS) htmlEl("td", { text: formatValue(c.q, r[c.key]) }, tr);
      return { id: r.id, tr };
    });
    const tr = htmlEl("tr", { class: "live" }, tbody);
    const th = htmlEl("th", { scope: "row", class: "state-col" }, tr);
    htmlEl("span", { class: "live-dot", "aria-hidden": "true" }, th);
    th.append("Now");
    live = { cells: COLUMNS.map(() => htmlEl("td", {}, tr)), shown: [] };
    active = "";
  }

  function tick(frames) {
    if (!solution) return;
    const f = frames[0];
    const r = stateRow(solution, f.state);
    COLUMNS.forEach((c, i) => {
      const text = formatValue(c.q, r[c.key]);
      if (live.shown[i] !== text) {
        live.cells[i].textContent = text;
        live.shown[i] = text;
      }
    });
    const ends = activeStates(solution, f);
    const key = ends.join(",");
    if (key !== active) {
      for (const row of rows) row.tr.classList.toggle("active", ends.includes(row.id));
      active = key;
    }
  }

  return { render, tick };
}
