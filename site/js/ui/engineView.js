// The piston–cylinder (SPEC section 5): a flat schematic cross-section, gas at the top, crank
// at the bottom. The geometry is in engine units inside one scaled group; all text is placed in
// screen pixels, so it stays a real 11–14 px whatever the size of the panel.
//
// Written against the model's list of cycles: each cycle gets its own engine, side by side.
// In explore mode the list has one entry. In compare mode (SPEC section 15) there are two, on
// one shared timeline: each is labeled with its cycle above it and shows a "waiting" tag while
// it waits through a slot only the other cycle has. The thermometer is left out there to give
// the two engines room; the gas color and the readouts still show the temperature.

import { colorRamp } from "../core/scale.js";
import { formatValue } from "../core/format.js";
import { GAS_RAMP_T } from "../state/defaults.js";
import { svgEl, htmlEl, symbolText, px, roleColor } from "./dom.js";

// ---------------------------------------------------------------- geometry, engine units
// y grows downward. Slider-crank with rod/crank = 3 (PHYSICS.md section 5).
const HALF_BORE = 60;
const OUTER = 72; // outer face of the cylinder wall
const STROKE = 130;
const CRANK = STROKE / 2;
const ROD = 3 * CRANK;
const Y_TDC = 120; // piston crown at TDC
const Y_BDC = Y_TDC + STROKE;
const PISTON_H = 56;
const PIN = 26; // wrist pin, below the crown
const Y_CRANK = Y_TDC + PIN + CRANK + ROD; // crank center: the wrist pin is CRANK + ROD above it at TDC
const LINER_END = Y_BDC + PISTON_H + 8;
const HEAD_T = 30; // cylinder head thickness
const WEB_R = 78; // crank web
const VALVE_X = 34;
const TOP = 6; // drawing extent: the spark plug tip at the smallest r, down to the crank web
const BOTTOM = Y_CRANK + WEB_R + 4;
const Q_TAIL = -126; // heat arrow, left of the cylinder
const Q_TIP = -44;
const W_X = -96; // work arrow, beside the piston
const THERMO_TOP = 40;
const THERMO_BOTTOM = LINER_END;

// ---------------------------------------------------------------- text and layout, pixels
const PAD = 6;
const LEFT_TEXT = 38; // room for the w label left of the work arrow
const RIGHT_TEXT = 94; // TDC/BDC labels, thermometer and its scale, right of the wall
const RIGHT_TEXT_COMPARE = 34; // TDC/BDC labels only
const LABEL_ROW = 24; // compare mode: the cycle's label and the waiting tag above each engine
const T_MIN = GAS_RAMP_T[0]; // the thermometer spans the fixed gas color scale
const T_MAX = GAS_RAMP_T[GAS_RAMP_T.length - 1];
const THERMO_TICKS = [500, 1000, 1500, 2000, 2500];

const CAPTION = {
  otto: "Air–fuel mixture, modeled as air",
  diesel: "Air only; fuel injection is modeled as heat addition",
  dual: "Air only; fuel injection is modeled as heat addition",
};

// Clearance volume to scale: the gas column is hc + xhat·S with hc = S/(r − 1), clamped, so a
// higher compression ratio visibly lowers the cylinder head (SPEC section 5).
const clearance = (r) => Math.min(60, Math.max(4, STROKE / (r - 1)));

let instances = 0;

export function createEngineView(container) {
  const uid = `engine${++instances}`;
  const figure = htmlEl("div", { class: "fill-box engine" }, container);
  const svg = svgEl("svg", { role: "img", "aria-labelledby": `${uid}-title` }, figure);
  svgEl("title", { id: `${uid}-title`, text: "Piston and cylinder" }, svg);
  const defs = svgEl("defs", {}, svg);
  const stage = svgEl("g", {}, svg);
  const readouts = htmlEl("div", { class: "readouts" }, container);
  const caption = htmlEl("p", { class: "engine-caption" }, container);

  let engines = [];
  let rows = [];
  let model = null;
  let lastFrames = null;
  let lastState = null;
  let size = { w: 0, h: 0 };
  let compare = false;
  let gasColor = () => "#ffffff";

  new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width === size.w && height === size.h) return;
    size = { w: width, h: height };
    if (model) {
      build();
      if (lastFrames) tick(lastFrames, lastState);
    }
  }).observe(figure);

  function render(newModel, state) {
    model = newModel;
    lastState = state;
    compare = model.mode === "compare";
    readouts.classList.toggle("two", model.cycles.length > 1);
    size = { w: figure.clientWidth, h: figure.clientHeight };
    const css = getComputedStyle(document.documentElement);
    gasColor = colorRamp(GAS_RAMP_T.map((T) => [T, css.getPropertyValue(`--gas-${T}`)]));
    // One caption per engine, each under its own engine.
    caption.replaceChildren(...model.cycles.map((c) => htmlEl("span", { text: CAPTION[c.solution.type] })));
    caption.classList.toggle("two", model.cycles.length > 1);
    buildReadouts();
    build();
  }

  function buildReadouts() {
    readouts.replaceChildren();
    rows = model.cycles.map((c) => {
      const dl = htmlEl("dl", { class: "readout", "aria-live": "off", "aria-label": compare ? c.label : null }, readouts);
      const cell = (symbol, unit) => {
        const div = htmlEl("div", {}, dl);
        const dt = htmlEl("dt", {}, div);
        htmlEl("var", { text: symbol }, dt);
        dt.append(` (${unit})`);
        return htmlEl("dd", {}, div);
      };
      return { P: cell("P", "kPa"), T: cell("T", "K"), v: cell("v", "m³/kg"), shown: {} };
    });
  }

  function build() {
    stage.replaceChildren();
    defs.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${size.w} ${size.h}`);
    if (size.w < 40 || size.h < 40) {
      engines = [];
      return;
    }
    const n = model.cycles.length;
    const colW = size.w / n;
    engines = model.cycles.map((c, i) => buildEngine(c, i, i * colW, colW));
  }

  // One engine in the column [x0, x0 + colW] of the figure.
  function buildEngine(cycle, index, x0, colW) {
    const id = `${uid}-${index}`;
    const { solution } = cycle;
    const hc = clearance(solution.inputs.r);
    const yHead = Y_TDC - hc;
    const yQ = yHead + hc / 2; // heat arrows point at the gas that is always there, under the head

    // Scale: as large as the height allows, unless the width (with its text) is the limit.
    const rightText = compare ? RIGHT_TEXT_COMPARE : RIGHT_TEXT;
    const top = compare ? LABEL_ROW : 0;
    const kH = (size.h - top - 2 * PAD) / (BOTTOM - TOP);
    const kW = (colW - 2 * PAD - LEFT_TEXT - rightText) / (-W_X + 14 + OUTER);
    const k = Math.max(0.1, Math.min(kH, kW));
    const leftExtent = Math.max(-Q_TAIL * k, (-W_X + 14) * k + LEFT_TEXT);
    const width = leftExtent + OUTER * k + rightText;
    const ox = x0 + (colW - width) / 2 + leftExtent;
    const oy = top + (size.h - top - (BOTTOM - TOP) * k) / 2 - TOP * k;
    const X = (u) => ox + u * k;
    const Y = (u) => oy + u * k;

    // Gradients: the gas glow, and the thermometer's color scale.
    const glow = svgEl("radialGradient", { id: `${id}-glow`, cx: "50%", cy: "45%", r: "60%" }, defs);
    svgEl("stop", { offset: "0", style: `stop-color:${roleColor("heatAdditionV")};stop-opacity:0.7` }, glow);
    svgEl("stop", { offset: "1", style: `stop-color:${roleColor("heatAdditionV")};stop-opacity:0` }, glow);
    const thermo = svgEl("linearGradient", { id: `${id}-thermo`, x1: 0, y1: 1, x2: 0, y2: 0 }, defs);
    for (const T of GAS_RAMP_T) {
      svgEl("stop", { offset: (T - T_MIN) / (T_MAX - T_MIN), style: `stop-color:var(--gas-${T})` }, thermo);
    }

    const root = svgEl("g", {}, stage);
    const geo = svgEl("g", { transform: `translate(${px(ox)} ${px(oy)}) scale(${k})` }, root);

    // Crank and connecting rod (moving parts are positioned in tick).
    svgEl("circle", { class: "web", cx: 0, cy: Y_CRANK, r: WEB_R }, geo);
    const arm = svgEl("polygon", { class: "part metal" }, geo);
    svgEl("circle", { class: "part pin", cx: 0, cy: Y_CRANK, r: 9 }, geo);
    const rod = svgEl("polygon", { class: "part metal-light" }, geo);
    const bigEnd = svgEl("circle", { class: "part metal-light", r: 14 }, geo);
    const crankPin = svgEl("circle", { class: "part pin", r: 7 }, geo);

    // Gas, its glow during heat addition, and the fuel spray.
    const gas = svgEl("rect", { x: -HALF_BORE, y: yHead, width: 2 * HALF_BORE, height: 0 }, geo);
    const glowRect = svgEl(
      "rect",
      { x: -HALF_BORE, y: yHead, width: 2 * HALF_BORE, height: 0, fill: `url(#${id}-glow)`, opacity: 0 },
      geo,
    );
    const injector = solution.type !== "otto";
    const spray = injector
      ? svgEl("polygon", { style: `fill:${roleColor("heatAdditionP")}`, opacity: 0 }, geo)
      : null;

    // Piston: body, ring grooves, wrist pin.
    const piston = svgEl("g", {}, geo);
    svgEl("rect", { class: "part metal-light", x: -58, y: 0, width: 116, height: PISTON_H, rx: 3 }, piston);
    for (const y of [8, 14, 20]) svgEl("line", { class: "groove", x1: -58, x2: 58, y1: y, y2: y }, piston);
    svgEl("circle", { class: "part pin", cx: 0, cy: PIN, r: 8 }, piston);

    // Cylinder walls and head, with the valves (closed in the ideal cycle).
    for (const x of [-OUTER, HALF_BORE]) {
      svgEl("rect", { class: "part metal", x, y: yHead, width: OUTER - HALF_BORE, height: LINER_END - yHead }, geo);
    }
    svgEl("rect", { class: "part metal", x: -OUTER - 8, y: yHead - HEAD_T, width: 2 * OUTER + 16, height: HEAD_T, rx: 3 }, geo);
    const valves = [-VALVE_X, VALVE_X].map((x) => {
      const v = svgEl("g", {}, geo);
      svgEl("rect", { class: "part metal-light", x: x - 2, y: yHead - HEAD_T - 14, width: 4, height: HEAD_T + 10 }, v);
      svgEl("rect", { class: "part metal", x: x - 8, y: yHead - HEAD_T - 18, width: 16, height: 4 }, v);
      svgEl("path", { class: "part metal-light", d: `M${x - 15} ${yHead}L${x + 15} ${yHead}L${x + 9} ${yHead - 6}L${x - 9} ${yHead - 6}Z` }, v);
      return v;
    });

    // Head hardware: spark plug (Otto) or fuel injector (Diesel, dual).
    const hw = svgEl("g", { transform: `translate(0 ${yHead})` }, geo);
    let spark = null;
    if (injector) {
      svgEl("rect", { class: "part metal", x: -2, y: -HEAD_T - 44, width: 4, height: 10 }, hw);
      svgEl("rect", { class: "part metal-light", x: -7, y: -HEAD_T - 34, width: 14, height: 34, rx: 3 }, hw);
      svgEl("rect", { class: "part metal", x: -11, y: -HEAD_T - 10, width: 22, height: 8 }, hw);
      svgEl("rect", { class: "part metal-light", x: -4, y: -HEAD_T, width: 8, height: HEAD_T }, hw);
      svgEl("path", { class: "part metal", d: "M-4 0L4 0L2 3L-2 3Z" }, hw);
    } else {
      svgEl("rect", { class: "part metal", x: -3, y: -HEAD_T - 36, width: 6, height: 6 }, hw);
      svgEl("rect", { class: "part pin", x: -6, y: -HEAD_T - 30, width: 12, height: 20, rx: 3 }, hw);
      svgEl("rect", { class: "part metal", x: -10, y: -HEAD_T - 10, width: 20, height: 10 }, hw);
      svgEl("rect", { class: "part metal-light", x: -6, y: -HEAD_T, width: 12, height: HEAD_T }, hw);
      svgEl("rect", { x: -1, y: 0, width: 2, height: 3, style: "fill:var(--ink-2)" }, hw);
      svgEl("path", { d: "M5 0L5 6L1 6", class: "part", fill: "none" }, hw);
      const star = [];
      for (let j = 0; j < 16; j++) {
        const a = (j * Math.PI) / 8;
        const r = j % 2 ? 4.5 : 15; // drawn large so it reads on a projector
        star.push(`${px(r * Math.sin(a))},${px(5 - r * Math.cos(a))}`);
      }
      spark = svgEl("polygon", { points: star.join(" "), style: `fill:${roleColor("heatAdditionV")}`, opacity: 0 }, hw);
    }

    // Heat arrows (left of the cylinder, at the gas) and the work arrow (beside the piston).
    const qGroup = svgEl("g", { transform: `translate(0 ${yQ})` }, geo);
    const qIn = svgEl("path", {
      d: `M${Q_TAIL} -5L${Q_TIP - 18} -5L${Q_TIP - 18} -12L${Q_TIP} 0L${Q_TIP - 18} 12L${Q_TIP - 18} 5L${Q_TAIL} 5Z`,
      style: `fill:${roleColor("heatAdditionV")}`,
      opacity: 0,
    }, qGroup);
    const qOut = svgEl("path", {
      d: `M${Q_TIP} -5L${Q_TAIL + 18} -5L${Q_TAIL + 18} -12L${Q_TAIL} 0L${Q_TAIL + 18} 12L${Q_TAIL + 18} 5L${Q_TIP} 5Z`,
      style: `fill:${roleColor("heatRejection")}`,
      opacity: 0,
    }, qGroup);
    const wGroup = svgEl("g", {}, geo);
    const wIn = svgEl("path", {
      d: `M${W_X - 4} 58L${W_X - 4} 32L${W_X - 11} 32L${W_X} 14L${W_X + 11} 32L${W_X + 4} 32L${W_X + 4} 58Z`,
      style: `fill:${roleColor("compression")}`,
      opacity: 0,
    }, wGroup);
    const wOut = svgEl("path", {
      d: `M${W_X - 4} 14L${W_X - 4} 40L${W_X - 11} 40L${W_X} 58L${W_X + 11} 40L${W_X + 4} 40L${W_X + 4} 14Z`,
      style: `fill:${roleColor("expansion")}`,
      opacity: 0,
    }, wGroup);

    // ------------------------------------------------------------ text and marks in pixels
    const text = svgEl("g", {}, root);

    // TDC and BDC: dashed lines across the bore, labeled beside the wall.
    for (const [y, label] of [[Y_TDC, "TDC"], [Y_BDC, "BDC"]]) {
      const yy = Math.round(Y(y)) + 0.5;
      svgEl("line", { class: "dead-center", x1: px(X(-HALF_BORE)), x2: px(X(HALF_BORE)), y1: yy, y2: yy }, text);
      svgEl("text", { class: "small-label", x: px(X(OUTER) + 6), y: yy, "dominant-baseline": "central", text: label }, text);
    }

    // Compare mode: the cycle above its engine (a line sample in its color, then its name) and
    // the "waiting" tag beside it.
    let waitTag = null;
    if (compare) {
      const cx = x0 + colW / 2;
      const name = `${cycle.side}: ${cycle.label.slice(3).replace(" cycle", "")}`;
      const nameW = 7.4 * name.length;
      const left = cx - (nameW + 22) / 2;
      svgEl("line", { class: `side-line ${cycle.id}`, x1: px(left), x2: px(left + 16), y1: 11, y2: 11 }, text);
      svgEl("text", { class: "side-label", x: px(left + 22), y: 11, "dominant-baseline": "central", text: name }, text);
      // Left of the cylinder, where the heat arrow would be: a waiting cycle adds no heat.
      waitTag = svgEl("g", { class: "wait-tag", opacity: 0, transform: `translate(${px(X(-OUTER) - 33)} ${px(Y(yQ))})` }, text);
      svgEl("rect", { x: -29, y: -9, width: 58, height: 18, rx: 9 }, waitTag);
      svgEl("text", { x: 0, y: 0.5, "text-anchor": "middle", "dominant-baseline": "central", text: "waiting" }, waitTag);
    }

    // Thermometer: the legend for the gas color, with a pointer at the current T (explore only).
    const tx = X(OUTER) + 50;
    const tTop = Y(THERMO_TOP);
    const tBottom = Y(THERMO_BOTTOM);
    const yOfT = (T) => tBottom - ((Math.min(T_MAX, Math.max(T_MIN, T)) - T_MIN) / (T_MAX - T_MIN)) * (tBottom - tTop);
    const thermoG = svgEl("g", { display: compare ? "none" : null }, text);
    symbolText(thermoG, { class: "small-label", x: px(tx + 5), y: px(tTop - 8), "text-anchor": "middle" }, "T", { after: " (K)" });
    svgEl("rect", { class: "thermo-bar", x: px(tx), y: px(tTop), width: 10, height: px(tBottom - tTop), rx: 5, fill: `url(#${id}-thermo)` }, thermoG);
    for (const T of THERMO_TICKS) {
      const y = Math.round(yOfT(T)) + 0.5;
      svgEl("line", { class: "thermo-tick", x1: px(tx + 10), x2: px(tx + 14), y1: y, y2: y }, thermoG);
      svgEl("text", { class: "tick-label", x: px(tx + 17), y, "dominant-baseline": "central", text: String(T) }, thermoG);
    }
    const pointer = svgEl("g", {}, thermoG);
    svgEl("path", { class: "pointer", d: `M${px(tx - 9)} -5L${px(tx - 2)} 0L${px(tx - 9)} 5Z` }, pointer);
    svgEl("line", { class: "pointer-line", x1: px(tx - 2), x2: px(tx + 12), y1: 0, y2: 0 }, pointer);

    // Energy labels: text in ink beside the colored arrows.
    const qx = px(X((Q_TAIL + Q_TIP - 18) / 2 - 8));
    const qy = px(Y(yQ - 12) - 5);
    const qInLabel = symbolText(text, { class: "energy-label", x: qx, y: qy, "text-anchor": "middle", opacity: 0 }, "q", { sub: "in" }).text;
    const qOutLabel = symbolText(text, { class: "energy-label", x: qx, y: qy, "text-anchor": "middle", opacity: 0 }, "q", { sub: "out" }).text;
    const w = symbolText(text, { class: "energy-label", x: px(X(W_X - 14) - 2), y: 0, "text-anchor": "end", "dominant-baseline": "central", opacity: 0 }, "w", { sub: "in" });
    const airLabel = svgEl("text", { class: "gas-label", x: px(X(0)), "text-anchor": "middle", "dominant-baseline": "central", text: "air", opacity: 0 }, text);

    return {
      k, X, Y, yHead, yOfT, gas, glowRect, spray, spark, piston, rod, bigEnd, crankPin, arm, valves,
      qIn, qOut, qInLabel, qOutLabel, wGroup, wIn, wOut, wLabel: w.text, wSub: w.sub, airLabel, pointer, waitTag,
      shown: new Map(),
    };
  }

  // Sets an attribute only when its value changed, to keep per-frame DOM writes small.
  function put(e, node, name, value) {
    const s = String(value);
    let attrs = e.shown.get(node);
    if (!attrs) e.shown.set(node, (attrs = {}));
    if (attrs[name] !== s) {
      node.setAttribute(name, s);
      attrs[name] = s;
    }
  }

  function tickEngine(e, f) {
    const crown = Y_TDC + f.xhat * STROKE;
    const gasH = crown - e.yHead;
    const T = f.state.T;

    // Gas: color is temperature on a fixed scale; glow while heat is added.
    put(e, e.gas, "height", px(gasH));
    put(e, e.gas, "fill", gasColor(T));
    put(e, e.glowRect, "height", px(gasH));
    put(e, e.glowRect, "opacity", px(f.heatIn * 0.9));

    // Piston, rod and crank from the crank angle (PHYSICS.md section 5).
    put(e, e.piston, "transform", `translate(0 ${px(crown)})`);
    const cx = CRANK * Math.sin(f.theta);
    const cy = Y_CRANK - CRANK * Math.cos(f.theta);
    const wy = crown + PIN;
    e.rod.setAttribute("points", band(0, wy, cx, cy, 7, 9));
    e.arm.setAttribute("points", band(0, Y_CRANK, cx, cy, 14, 10));
    e.bigEnd.setAttribute("cx", px(cx));
    e.bigEnd.setAttribute("cy", px(cy));
    e.crankPin.setAttribute("cx", px(cx));
    e.crankPin.setAttribute("cy", px(cy));

    // Head hardware: a spark at the start of heat addition, or the fuel spray throughout it.
    if (e.spark) {
      const t = f.slot === "HV" && f.heatIn > 0 ? f.tau : 1;
      const flash = t < 0.05 ? t / 0.05 : t < 0.35 ? 1 - (t - 0.05) / 0.3 : 0;
      put(e, e.spark, "opacity", px(flash));
    }
    if (e.spray) {
      const h = Math.max(0, Math.min(30, gasH - 5));
      const half = 0.8 * h;
      const y0 = e.yHead + 3;
      e.spray.setAttribute("points", `-1.5,${px(y0)} 1.5,${px(y0)} ${px(half)},${px(y0 + h)} ${px(-half)},${px(y0 + h)}`);
      put(e, e.spray, "opacity", px(f.heatIn * 0.6));
    }

    // Valves open only during the optional strokes (M5); frame.valves is 0 here.
    put(e, e.valves[0], "transform", `translate(0 ${px(f.valves.intake * 10)})`);
    put(e, e.valves[1], "transform", `translate(0 ${px(f.valves.exhaust * 10)})`);

    // Heat and work arrows.
    put(e, e.qIn, "opacity", px(f.heatIn));
    put(e, e.qInLabel, "opacity", px(f.heatIn));
    put(e, e.qOut, "opacity", px(f.heatOut));
    put(e, e.qOutLabel, "opacity", px(f.heatOut));
    put(e, e.wGroup, "transform", `translate(0 ${px(crown)})`);
    put(e, e.wIn, "opacity", f.workSign < 0 ? 1 : 0);
    put(e, e.wOut, "opacity", f.workSign > 0 ? 1 : 0);
    put(e, e.wLabel, "opacity", f.workSign !== 0 ? 1 : 0);
    put(e, e.wLabel, "y", px(e.Y(crown + 36)));
    const sub = f.workSign > 0 ? "out" : "in";
    if (e.wSub.textContent !== sub) e.wSub.textContent = sub;

    // Thermometer pointer and the "air" label, which shows only where it fits.
    put(e, e.pointer, "transform", `translate(0 ${px(e.yOfT(T))})`);
    put(e, e.airLabel, "y", px(e.Y((e.yHead + crown) / 2)));
    put(e, e.airLabel, "opacity", gasH * e.k >= 22 ? 1 : 0);
    if (e.waitTag) put(e, e.waitTag, "opacity", f.waiting ? 1 : 0);
  }

  function tick(frames, state) {
    lastFrames = frames;
    lastState = state;
    engines.forEach((e, i) => tickEngine(e, frames[i]));
    rows.forEach((row, i) => {
      const st = frames[i].state;
      for (const q of ["P", "T", "v"]) {
        const s = formatValue(q, st[q]);
        if (row.shown[q] !== s) {
          row[q].textContent = s;
          row.shown[q] = s;
        }
      }
    });
  }

  return { render, tick };
}

// Corners of a band from (x1, y1) to (x2, y2), half-width w1 at the first end and w2 at the
// second: the connecting rod and the crank arm.
function band(x1, y1, x2, y2, w1, w2) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  return [
    [x1 + nx * w1, y1 + ny * w1],
    [x2 + nx * w2, y2 + ny * w2],
    [x2 - nx * w2, y2 - ny * w2],
    [x1 - nx * w1, y1 - ny * w1],
  ]
    .map(([x, y]) => `${px(x)},${px(y)}`)
    .join(" ");
}
