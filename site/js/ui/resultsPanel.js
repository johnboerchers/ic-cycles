// Results panel (SPEC section 9): stat tiles for the thermal efficiency (the largest), w_net,
// q_in, q_out, MEP, T_max and P_max; the Carnot efficiency between T_max and T1 for reference;
// for Otto the derived pressure ratio. A dual cycle with rp = rc = 1 adds no heat: every value
// reads "—" and a hint says what to change.
//
// Variable specific heats (SPEC section 19): under the Carnot line, the efficiency of the same
// cycle with the cold-air standard (k = 1.4); above 3500 K a note under the tiles.
//
// Friction (SPEC section 20, PHYSICS.md section 13): while model.friction is set, a table
// "Indicated and brake" under the tiles (MEP, efficiency, power, torque), one muted line with
// η_m, the friction power and the heat input, and for an engine that cannot run a note.

import { resultValues } from "../core/tables.js";
import { frictionResults } from "../core/friction.js";
import { formatValue } from "../core/format.js";
import { htmlEl, symbolHtml } from "./dom.js";

const TILES = [
  { key: "wnet", sym: "w", sub: "net", unit: "kJ/kg", q: "w" },
  { key: "qin", sym: "q", sub: "in", unit: "kJ/kg", q: "q" },
  { key: "qout", sym: "q", sub: "out", unit: "kJ/kg", q: "q" },
  { key: "mep", sym: "MEP", unit: "kPa", q: "mep", plain: true },
  { key: "Tmax", sym: "T", sub: "max", unit: "K", q: "T" },
  { key: "Pmax", sym: "P", sub: "max", unit: "kPa", q: "P" },
];

export function createResultsPanel(container) {
  const body = htmlEl("div", { class: "results" }, container);

  const hero = htmlEl("div", { class: "tile hero" }, body);
  const heroLabel = htmlEl("div", { class: "tile-label" }, hero);
  heroLabel.append("Thermal efficiency ");
  symbolHtml(heroLabel, "η", "th");
  const eta = htmlEl("div", { class: "tile-value big" }, hero);
  const carnot = htmlEl("div", { class: "tile-note" }, hero);
  const cold = htmlEl("div", { class: "tile-note" }, hero);
  const derived = htmlEl("div", { class: "tile-note" }, hero);
  const hint = htmlEl("div", { class: "tile-hint", hidden: "" }, hero);
  hint.append("Add heat: raise ");
  symbolHtml(hint, "r", "p");
  hint.append(" or ");
  symbolHtml(hint, "r", "c");
  hint.append(".");

  const grid = htmlEl("div", { class: "tile-grid" }, body);
  const cells = TILES.map((t) => {
    const tile = htmlEl("div", { class: "tile" }, grid);
    const label = htmlEl("div", { class: "tile-label" }, tile);
    if (t.plain) label.append(t.sym);
    else symbolHtml(label, t.sym, t.sub);
    const value = htmlEl("div", { class: "tile-value" }, tile);
    const num = htmlEl("span", {}, value);
    const unitEl = htmlEl("span", { class: "unit", text: ` ${t.unit}` }, value);
    return { ...t, num, unitEl };
  });
  const hot = htmlEl("p", { class: "tile-note results-note", hidden: "", text: "Above 3500 K the air data are extended, and real air would dissociate." }, body);

  // Friction: the table, its line and the cannot-run note. Filled by render().
  const brake = htmlEl("div", { class: "brake", hidden: "" }, body);
  const brakeTable = htmlEl("table", { class: "brake-table" }, brake);
  htmlEl("caption", { text: "Indicated and brake" }, brakeTable);
  const headRow = htmlEl("tr", {}, htmlEl("thead", {}, brakeTable));
  htmlEl("td", {}, headRow);
  htmlEl("th", { scope: "col", text: "Indicated" }, headRow);
  htmlEl("th", { scope: "col", text: "Brake" }, headRow);
  const BRAKE_ROWS = [
    { label: "MEP", q: "mep", unit: "kPa", i: "imep", b: "bmep" },
    { label: "Efficiency", q: "eta", unit: "", i: "eta", b: "etab" },
    { label: "Power", q: "power", unit: "kW", i: "Wi", b: "Wb" },
    { label: "Torque", q: "torque", unit: "N·m", i: "taui", b: "taub" },
  ];
  const brakeBody = htmlEl("tbody", {}, brakeTable);
  const brakeCells = BRAKE_ROWS.map((row) => {
    const tr = htmlEl("tr", {}, brakeBody);
    htmlEl("th", { scope: "row", text: row.label }, tr);
    return { ...row, ind: htmlEl("td", {}, tr), brk: htmlEl("td", {}, tr) };
  });
  const brakeLine = htmlEl("p", { class: "tile-note brake-line" }, brake);
  const brakeNote = htmlEl("p", { class: "tile-note brake-note", hidden: "", text: "Friction is larger than the indicated work: this engine could not keep itself running." }, brake);

  const withUnit = (q, x, unit) => (Number.isFinite(x) && unit ? `${formatValue(q, x)} ${unit}` : formatValue(q, x));

  function renderBrake(solution, engine, heatAdded, indicatedEta) {
    brake.hidden = !engine;
    if (!engine) return;
    const f = frictionResults(solution, engine);
    // No heat added: nothing to compare, every value reads "—" like the tiles.
    const ok = heatAdded;
    const run = ok && f.canRun;
    const values = { ...f, eta: indicatedEta, etab: run ? f.etab : NaN };
    for (const c of brakeCells) {
      const show = (key) => withUnit(c.q, ok ? values[key] : NaN, c.unit);
      c.ind.textContent = show(c.i);
      c.brk.textContent = show(c.b);
    }
    brakeLine.replaceChildren("Mechanical efficiency ");
    symbolHtml(brakeLine, "η", "m");
    brakeLine.append(` = ${formatValue("eta", run ? f.etam : NaN)}. Friction power ${formatValue("power", ok ? f.Wf : NaN)} kW. Heat input ${formatValue("power", ok ? f.Qin : NaN)} kW.`);
    brakeNote.hidden = !(ok && !f.canRun);
  }

  function render(model) {
    // Explore mode shows one cycle; compare mode has its own results table (M6).
    const { solution } = model.cycles[0];
    const r = resultValues(solution);
    eta.textContent = formatValue("eta", r.eta);
    for (const c of cells) {
      c.num.textContent = formatValue(c.q, r[c.key]);
      c.unitEl.hidden = !r.heatAdded; // "—" alone, not "— kJ/kg"
    }
    hint.hidden = r.heatAdded;
    carnot.replaceChildren(`Carnot between `);
    symbolHtml(carnot, "T", "max");
    carnot.append(" and ");
    symbolHtml(carnot, "T", "1");
    carnot.append(`: ${formatValue("eta", r.etaCarnot)}`);
    carnot.hidden = !r.heatAdded;
    const coldCycle = model.cycles[0].cold?.solution;
    cold.replaceChildren();
    if (coldCycle && r.heatAdded) {
      cold.append("Cold-air standard (");
      symbolHtml(cold, "k");
      cold.append(` = 1.4): ${formatValue("eta", coldCycle.metrics.eta)}`);
    }
    // The air data end at 3500 K; above it they are extended with a constant cp (PHYSICS 12.1).
    hot.hidden = !(solution.gas.kind === "variable" && r.Tmax > 3500);
    renderBrake(solution, model.friction, r.heatAdded, r.eta);
    derived.replaceChildren();
    if (solution.type === "otto") {
      derived.append("Pressure ratio ");
      symbolHtml(derived, "r", "p");
      derived.append(` = ${formatValue("ratio", r.rp)}`);
    }
  }

  return { render, tick() {} };
}
