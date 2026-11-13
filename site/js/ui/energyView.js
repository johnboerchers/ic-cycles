// Energy panel (SPEC section 12): the first law at work, per process and for the cycle.
// One row per process (plus the exhaust and intake strokes when they are on) with three bar
// cells, heat, work and Δu, all on one scale. The current row fills from frame.energy, rows
// already done this pass are full, rows not yet reached are outlined; at state 1 everything
// starts again. Under the table: the totals and a bar of q_in split into w_net and q_out.

import { energyTable, energyProgress } from "../core/energy.js";
import { formatValue } from "../core/format.js";
import { htmlEl, symbolHtml, roleColor } from "./dom.js";

const EPS = 1e-9;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// Subscript of a heat or work total, as magnitudes with in/out (Çengel & Boles); null for 0.
function sub(x, positive) {
  if (Math.abs(x) < EPS) return null;
  if (x > 0) return positive;
  return positive === "in" ? "out" : "in";
}

// "Δu" with the u in italics.
function deltaU(parent) {
  parent.append("Δ");
  htmlEl("var", { text: "u" }, parent);
  return parent;
}

export function createEnergyView(container) {
  const body = htmlEl("div", { class: "energy" }, container);
  let rows = [];
  let cells = [];
  let shown = []; // per row: what tick last wrote

  function render(model) {
    const table = energyTable(model);
    rows = table.rows;
    body.replaceChildren();

    const grid = htmlEl("div", { class: "energy-grid", role: "table", "aria-label": "Energy per process" }, body);
    const head = htmlEl("div", { class: "energy-row energy-head", role: "row" }, grid);
    htmlEl("span", { role: "columnheader", text: "Process" }, head);
    htmlEl("span", { role: "columnheader", text: "Heat" }, head);
    htmlEl("span", { role: "columnheader", text: "Work" }, head);
    deltaU(htmlEl("span", { role: "columnheader" }, head));

    cells = rows.map((r) => {
      const row = htmlEl("div", { class: `energy-row${r.stroke ? " stroke" : ""}`, role: "row", style: `--c:${roleColor(r.role)}` }, grid);
      const name = htmlEl("span", { class: "energy-name", role: "rowheader" }, row);
      htmlEl("span", { class: "chip", style: `background:${roleColor(r.role)}` }, name);
      name.append(r.label);
      const heat = barCell(row, "q", sub(r.q, "in"), Math.abs(r.q) / table.max, false);
      const work = barCell(row, "w", sub(r.w, "out"), Math.abs(r.w) / table.max, false);
      const du = barCell(row, "Δu", r.du < 0 ? "neg" : "pos", Math.abs(r.du) / table.max, true);
      return { row, heat, work, du };
    });

    // The two strokes: the same work in and out, so they cancel.
    const strokes = rows.filter((r) => r.stroke);
    if (strokes.length) {
      const note = htmlEl("p", { class: "energy-cancel" }, body);
      note.append("Exhaust and intake: ");
      symbolHtml(note, "w", "in");
      note.append(" = ");
      symbolHtml(note, "w", "out");
      note.append(` = ${formatValue("w", Math.abs(strokes[0].w))} kJ/kg. They cancel, so the cycle analysis leaves them out.`);
    }

    // Totals: q_in − q_out = w_net, and the Δu add up to zero over the cycle.
    const t = table.totals;
    const heated = t.qin > EPS;
    const totals = htmlEl("div", { class: "energy-totals" }, body);
    const first = htmlEl("span", {}, totals);
    symbolHtml(first, "q", "in");
    first.append(" − ");
    symbolHtml(first, "q", "out");
    first.append(" = ");
    symbolHtml(first, "w", "net");
    first.append(`: ${formatValue("q", t.qin)} − ${formatValue("q", t.qout)} = `);
    htmlEl("strong", { text: formatValue("w", t.wnet) }, first);
    first.append(" kJ/kg");
    const second = htmlEl("span", {}, totals);
    second.append("Σ");
    deltaU(second);
    // Zero by the first law; written "0" rather than "0.0" or "−0.0" from rounding.
    second.append(` = ${Math.abs(t.sumDu) < 0.05 ? "0" : formatValue("u", t.sumDu)}`);

    // Summary bar: its length is q_in, split into w_net and q_out; η_th is the first share.
    const eta = heated ? t.wnet / t.qin : NaN;
    const sum = htmlEl("div", { class: "energy-summary" }, body);
    const cap = htmlEl("div", { class: "energy-eta" }, sum);
    symbolHtml(cap, "η", "th");
    cap.append(" = ");
    symbolHtml(cap, "w", "net");
    cap.append(" / ");
    symbolHtml(cap, "q", "in");
    cap.append(" = ");
    htmlEl("strong", { text: formatValue("eta", eta) }, cap);
    const bar = htmlEl("div", { class: "summary-bar", role: "img" }, sum);
    const share = heated ? clamp01(t.wnet / t.qin) : 0;
    htmlEl("span", { class: "summary-net", style: `flex-grow:${heated ? share : 0}` }, bar);
    htmlEl("span", { class: "summary-out", style: `flex-grow:${heated ? 1 - share : 0}` }, bar);
    bar.setAttribute("aria-label", heated
      ? `Of the heat added, ${formatValue("eta", share)} becomes net work and the rest is rejected.`
      : "No heat is added.");
    const legend = htmlEl("div", { class: "summary-legend" }, sum);
    const l1 = htmlEl("span", {}, legend);
    htmlEl("span", { class: "chip summary-net" }, l1);
    symbolHtml(l1, "w", "net");
    l1.append(` ${formatValue("w", heated ? t.wnet : NaN)}`);
    const l2 = htmlEl("span", {}, legend);
    htmlEl("span", { class: "chip summary-out" }, l2);
    symbolHtml(l2, "q", "out");
    l2.append(` ${formatValue("q", heated ? t.qout : NaN)}`);
    const l3 = htmlEl("span", { class: "summary-total" }, legend);
    l3.append("of ");
    symbolHtml(l3, "q", "in");
    l3.append(` ${formatValue("q", heated ? t.qin : NaN)} kJ/kg`);

    shown = rows.map(() => ({}));
  }

  // A bar cell: the symbol and value on top, the bar under it. `frac` is the row total on the
  // shared scale; the outline shows it, the fill grows inside it. Δu cells diverge from a zero
  // line in their middle, so they are twice as wide (CSS) and keep the same scale.
  function barCell(row, symbol, subscript, frac, diverging) {
    const cell = htmlEl("span", { class: `energy-cell${diverging ? " diverging" : ""}`, role: "cell" }, row);
    const label = htmlEl("span", { class: "energy-label" }, cell);
    let value;
    if (diverging) {
      deltaU(htmlEl("span", {}, label));
      value = htmlEl("span", { class: "energy-value" }, label);
    } else if (subscript) {
      symbolHtml(htmlEl("span", {}, label), symbol, subscript);
      value = htmlEl("span", { class: "energy-value" }, label);
    } else {
      value = htmlEl("span", { class: "energy-value zero", text: "0" }, label);
    }
    const track = htmlEl("span", { class: "energy-track" }, cell);
    if (diverging) htmlEl("span", { class: "energy-zero" }, track);
    const side = diverging ? (subscript === "neg" ? "neg" : "pos") : "pos";
    const width = diverging ? 50 * frac : 100 * frac;
    const outline = htmlEl("span", { class: `energy-outline ${diverging ? side : ""}`.trim(), style: `width:${width}%` }, track);
    outline.hidden = frac < 1e-6; // a zero total draws no bar at all
    const fill = htmlEl("span", { class: "energy-fill" }, outline);
    return { value, fill, zero: !subscript && !diverging };
  }

  function tick(frames) {
    if (!rows.length) return;
    const progress = energyProgress(rows, frames[0]);
    rows.forEach((r, i) => {
      const p = progress[i];
      const c = cells[i];
      const s = shown[i];
      if (s.status !== p.status) {
        c.row.dataset.status = p.status;
        s.status = p.status;
      }
      // The current row shows its running values; the others their totals.
      const vals = p.status === "current" ? p : r;
      setCell(c.heat, s, "q", r.q, vals.q, "q");
      setCell(c.work, s, "w", r.w, vals.w, "w");
      setCell(c.du, s, "du", r.du, vals.du, "u", true);
    });
  }

  function setCell(cell, s, key, total, now, quantity, signed = false) {
    const frac = s.status === "ahead" || Math.abs(total) < EPS ? 0 : clamp01(now / total);
    const f = Math.round(1000 * frac) / 1000;
    if (s[`${key}F`] !== f) {
      cell.fill.style.transform = `scaleX(${f})`;
      s[`${key}F`] = f;
    }
    if (cell.zero) return;
    const text = formatValue(quantity, signed ? now : Math.abs(now));
    if (s[`${key}T`] !== text) {
      cell.value.textContent = text;
      s[`${key}T`] = text;
    }
  }

  return { render, tick };
}
