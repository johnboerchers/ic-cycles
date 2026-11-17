// Results panel (SPEC section 9): stat tiles for the thermal efficiency (the largest), w_net,
// q_in, q_out, MEP, T_max and P_max; the Carnot efficiency between T_max and T1 for reference;
// for Otto the derived pressure ratio. A dual cycle with rp = rc = 1 adds no heat: every value
// reads "—" and a hint says what to change.
//
// Variable specific heats (SPEC section 19): under the Carnot line, the efficiency of the same
// cycle with the cold-air standard (k = 1.4); above 3500 K a note under the tiles.

import { resultValues } from "../core/tables.js";
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
    derived.replaceChildren();
    if (solution.type === "otto") {
      derived.append("Pressure ratio ");
      symbolHtml(derived, "r", "p");
      derived.append(` = ${formatValue("ratio", r.rp)}`);
    }
  }

  return { render, tick() {} };
}
