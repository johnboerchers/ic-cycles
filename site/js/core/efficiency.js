// Efficiency curves (SPEC section 13): thermal efficiency against compression ratio, from the
// closed form (PHYSICS.md section 3). Plain data for ui/efficiencyView.js:
//   { main: [curve], refs: [curve], markers: [{ r, eta, key, label }] }
// with curve = { key, label, points: [[r, eta], ...] }. Explore mode has one main curve (bold)
// and the gray reference curves; compare mode has one main curve per side and no references.

import { gasFor } from "./gas.js";
import { etaClosedForm, ratiosFor, ratiosFromHeat, solveCycle } from "./cycle.js";
import { addsHeat } from "./tables.js";
import { formatValue } from "./format.js";
import { CONTENT } from "../content/content.js";

export const R_RANGE = [2, 26]; // the chart's r axis
const N = 97; // points per curve: r in steps of 0.25

const SAME = 1e-6; // a reference curve this close to the main curve's parameter is not drawn

// [[r, eta], ...] for r across the chart, given the ratios {rp, rc} at each r.
export function etaCurve(ratiosAt, k, n = N) {
  const [r0, r1] = R_RANGE;
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = r0 + ((r1 - r0) * i) / (n - 1);
    const { rp, rc } = ratiosAt(r);
    out.push([r, etaClosedForm({ r, rp, rc, k })]);
  }
  return out;
}

const fixedRatios = (rp, rc) => () => ({ rp, rc });

// Variable specific heats (PHYSICS.md section 12.6): every point is a complete cycle solved at
// that r, so there is no closed form. `ratiosAt(r)` gives {rp, rc} with the quantity the chart
// holds fixed held fixed. Points where rc >= r are skipped: state 3 would lie past BDC.
export function etaCurveSolved(type, ratiosAt, P1, T1, gas, n = N) {
  const [r0, r1] = R_RANGE;
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = r0 + ((r1 - r0) * i) / (n - 1);
    const { rp, rc } = ratiosAt(r);
    if (rc >= r) continue;
    out.push([r, solveCycle({ type, P1, T1, r, rp, rc, gas }).metrics.eta]);
  }
  return out;
}

const COLD_K = 1.4;

// Explore mode: the current cycle bold, with the reference curves for its type.
//   Otto: k = 1.3 and 1.667.  Diesel: r_c = 1 (the Otto limit), 2, 3, 4.
//   Dual: the Otto curve and the Diesel curve with the same r_c.
// Labels are [symbol, subscript, rest] parts, so the view can set the symbol in italics.
// With variable specific heats it is exploreCurvesVariable instead.
export function exploreCurves(solution) {
  if (solution.gas.kind === "variable") return exploreCurvesVariable(solution);
  const { type, gas, inputs } = solution;
  const { k } = gas;
  const { rp, rc, r } = inputs;
  const refs = [];
  let mainLabel;
  if (type === "otto") {
    mainLabel = [["k", "", ` = ${num(k)}`]];
    for (const kr of [1.3, 1.667]) {
      if (Math.abs(kr - k) > SAME) refs.push({ key: `k${kr}`, label: [["k", "", ` = ${num(kr)}`]], points: etaCurve(fixedRatios(1, 1), kr) });
    }
  } else if (type === "diesel") {
    mainLabel = [["r", "c", ` = ${num(rc)}`]];
    for (const c of [1, 2, 3, 4]) {
      if (Math.abs(c - rc) <= SAME) continue;
      const rest = c === 1 ? " = 1 (Otto)" : ` = ${c}`;
      refs.push({ key: `rc${c}`, label: [["r", "c", rest]], points: etaCurve(fixedRatios(1, c), k) });
    }
  } else {
    mainLabel = [["", "", "Dual"]];
    refs.push({ key: "otto", label: [["", "", "Otto"]], points: etaCurve(fixedRatios(1, 1), k) });
    if (rc > 1 + SAME) refs.push({ key: "diesel", label: [["", "", "Diesel, "], ["r", "c", ` = ${num(rc)}`]], points: etaCurve(fixedRatios(1, rc), k) });
  }
  const ok = addsHeat(solution);
  const main = ok ? [{ key: "main", label: mainLabel, points: etaCurve(fixedRatios(rp, rc), k) }] : [];
  const markers = ok ? [{ key: "main", r, eta: solution.metrics.eta }] : [];
  return { main, refs, markers };
}

// Explore mode with variable specific heats (SPEC section 19). The bold curve is the current
// cycle, holding fixed what its type is specified by: q_in for Otto, r_c for Diesel, r_p and
// r_c for the dual cycle. One gray reference, "cold air, k = 1.4", is the same cycle with
// constant specific heats (its closed form). For Otto, two more gray curves at q_in = 400 and
// 1600 kJ/kg show that the efficiency now depends on the heat input.
function exploreCurvesVariable(solution) {
  const { type, gas, inputs } = solution;
  const { P1, T1, rp, rc, r } = inputs;
  const qin = solution.metrics.qin;
  const solved = (ratiosAt) => etaCurveSolved(type, ratiosAt, P1, T1, gas);
  const otto = (q) => (rr) => ratiosFor("otto", { r: rr, qin: q }, T1, gas);
  const refs = [];
  let main, coldRatios;
  if (type === "otto") {
    main = { label: [["q", "in", ` = ${num(qin)}`]], points: solved(otto(qin)) };
    coldRatios = [1, 1];
  } else if (type === "diesel") {
    main = { label: [["r", "c", ` = ${num(rc)}`]], points: solved(fixedRatios(1, rc)) };
    coldRatios = [1, rc];
  } else {
    main = { label: [["", "", "Dual"]], points: solved(fixedRatios(rp, rc)) };
    coldRatios = [rp, rc];
  }
  refs.push({
    key: "cold",
    label: [["", "", "cold air, "], ["k", "", ` = ${num(COLD_K)}`]],
    points: etaCurve(fixedRatios(...coldRatios), COLD_K),
  });
  if (type === "otto") {
    for (const q of [400, 1600]) {
      if (Math.abs(q - qin) > SAME) refs.push({ key: `qin${q}`, label: [["q", "in", ` = ${num(q)}`]], points: solved(otto(q)) });
    }
  }
  const ok = addsHeat(solution);
  return {
    main: ok ? [{ key: "main", ...main }] : [],
    refs,
    markers: ok ? [{ key: "main", r, eta: solution.metrics.eta }] : [],
  };
}

// Compare mode: one curve per side, with what the "hold equal" choice keeps fixed held fixed as
// r varies: q_in and the heat split when r or P_max is shared, the side's own parameters when
// nothing is held equal. Each side's marker sits at its own r.
export function compareCurves(model, state) {
  const { shared, compare } = state;
  const gas = gasFor(state.specificHeats, shared.k);
  const variable = gas.kind === "variable";
  const main = [];
  const markers = [];
  for (const c of model.cycles) {
    const key = c.id;
    const side = compare[key];
    const xv = side.type === "otto" ? 1 : side.type === "diesel" ? 0 : side.xv;
    const ratiosAt = compare.constraint === "independent"
      ? (r) => ratiosFor(side.type, { ...side.params, r }, shared.T1, gas)
      : (r) => ratiosFromHeat({ r, qin: compare.shared.qin, xv }, shared.T1, gas);
    const points = variable
      ? etaCurveSolved(side.type, ratiosAt, shared.P1, shared.T1, gas)
      : etaCurve(ratiosAt, gas.k);
    main.push({ key, label: [["", "", `${c.side} ${CONTENT.cycles[side.type].name.replace(" cycle", "")}`]], points });
    if (addsHeat(c.solution)) markers.push({ key, r: c.solution.inputs.r, eta: c.solution.metrics.eta });
  }
  return { main, refs: [], markers };
}

// Vertical positions for labels that must not overlap: each wants to sit at ys[i]; returns
// positions at least `gap` apart, as close to the wanted ones as possible, inside [lo, hi].
// Labels keep their order. (Pools neighbors that collide and centers each pool on its mean.)
export function spreadLabels(ys, gap, lo = -Infinity, hi = Infinity) {
  const order = ys.map((y, i) => i).sort((a, b) => ys[a] - ys[b]);
  let pools = [];
  for (const i of order) {
    pools.push({ idx: [i], want: [ys[i]], top: ys[i] });
    // merge while the last pool overlaps the one before it
    while (pools.length > 1) {
      const b = pools[pools.length - 1];
      const a = pools[pools.length - 2];
      if (a.top + a.idx.length * gap <= b.top) break;
      const idx = [...a.idx, ...b.idx];
      const want = [...a.want, ...b.want];
      const mean = want.reduce((s, y, j) => s + y - j * gap, 0) / want.length;
      pools.splice(-2, 2, { idx, want, top: mean });
    }
  }
  // Keep the whole stack inside [lo, hi]: shift down from the top, then up from the bottom.
  const out = new Array(ys.length);
  let floor = lo;
  for (const p of pools) {
    p.top = Math.max(p.top, floor);
    floor = p.top + p.idx.length * gap;
  }
  let ceil = hi;
  for (let j = pools.length - 1; j >= 0; j--) {
    const p = pools[j];
    p.top = Math.min(p.top, ceil - (p.idx.length - 1) * gap);
    ceil = p.top - gap;
  }
  for (const p of pools) p.idx.forEach((i, j) => (out[i] = p.top + j * gap));
  return out;
}

// Ratios and k in labels as typed: "1.4", "2", "1.667".
const num = (x) => formatValue("ratio", x);

// Where to put a label: the first of the candidate spots (label centers) whose box of size
// { w, h } keeps at least `margin` px from every polyline, or else the spot with the most room.
// Used for the marker values, which must not sit on a curve (two curves in compare mode).
export function clearSpot(spots, box, polylines, margin) {
  let best = null;
  for (const spot of spots) {
    const room = clearance(spot, box, polylines);
    if (room >= margin) return spot;
    if (!best || room > best.room) best = { spot, room };
  }
  return best ? best.spot : null;
}

// Smallest distance from a box centered at (x, y) to the polylines, sampling each segment
// every 2 px.
function clearance({ x, y }, { w, h }, polylines) {
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const y0 = y - h / 2;
  const y1 = y + h / 2;
  const toBox = (px, py) => Math.hypot(Math.max(x0 - px, 0, px - x1), Math.max(y0 - py, 0, py - y1));
  let room = Infinity;
  for (const line of polylines) {
    for (let i = 1; i < line.length; i++) {
      const [ax, ay] = line[i - 1];
      const [bx, by] = line[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
      for (let j = 0; j <= n; j++) room = Math.min(room, toBox(ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n));
    }
  }
  return room;
}
