// Efficiency chart (SPEC section 13): thermal efficiency against compression ratio, r from 2 to
// 26 and η from 0 to 100 %. The curve for the current settings is bold with a marker at the
// current r and its value; thin gray reference curves are labeled at their right ends (no
// legend box); light bands mark the compression ratios of real engines. Hover shows a crosshair
// with r and η; dragging a marker changes r.
//
// In compare mode there is one curve per cycle, A solid and B dashed in the compare colors,
// with a marker each. A marker can be dragged when r is free: the shared r ("same compression
// ratio") or the side's own r ("nothing held equal"); with the same peak pressure r follows.

import { linear } from "../core/scale.js";
import { formatValue } from "../core/format.js";
import { exploreCurves, compareCurves, spreadLabels, R_RANGE } from "../core/efficiency.js";
import { clampTo } from "../core/params.js";
import { PARAMS, COMPARE, ENGINE_BANDS } from "../state/defaults.js";
import { svgEl, htmlEl, px, polyline } from "./dom.js";

const MARGIN = { top: 26, right: 112, bottom: 40, left: 46 };
const X_TICKS = [2, 6, 10, 14, 18, 22, 26];
const Y_TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1];
const LABEL_GAP = 14; // px between labels at the right ends
const GRAB_PX = 14; // pointer this close to a marker grabs it
const CHAR_W = 7.2;

const crisp = (v) => Math.round(v) + 0.5;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

let instances = 0;

export function createEfficiencyView(container, { actions }) {
  const uid = `eff${++instances}`;
  const box = htmlEl("div", { class: "fill-box eff-box" }, container);
  const svg = svgEl("svg", { class: "diagram efficiency", role: "img", "aria-labelledby": `${uid}-title` }, box);
  const titleEl = svgEl("title", { id: `${uid}-title`, text: "Thermal efficiency against compression ratio" }, svg);
  const layer = {};
  for (const name of ["bands", "grid", "axes", "refs", "main", "labels", "hover", "markers"]) layer[name] = svgEl("g", {}, svg);

  let model = null;
  let state = null;
  let data = null;
  let size = { w: 0, h: 0 };
  let sx = null;
  let sy = null;
  let plot = null;
  let markers = []; // drawn markers: { key, x, y, drag }
  let hover = null;
  let dragging = null; // the marker being dragged

  new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width === size.w && height === size.h) return;
    size = { w: width, h: height };
    if (model) build();
  }).observe(box);

  function render(newModel, newState) {
    model = newModel;
    state = newState;
    data = model.mode === "compare" ? compareCurves(model, state) : exploreCurves(model.cycles[0].solution);
    size = { w: box.clientWidth, h: box.clientHeight };
    build();
  }

  // Stroke of a main curve: ink in explore mode, the side's color in compare mode.
  const paint = (key) => (key === "main" ? "var(--ink)" : `var(--compare-${key})`);

  function build() {
    for (const g of Object.values(layer)) g.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${size.w} ${size.h}`);
    markers = [];
    if (size.w < 160 || size.h < 120) return;
    plot = { left: MARGIN.left, right: size.w - MARGIN.right, top: MARGIN.top, bottom: size.h - MARGIN.bottom };
    sx = linear(R_RANGE, [plot.left, plot.right]);
    sy = linear([0, 1], [plot.bottom, plot.top]);

    // Bands of real engines, behind everything, labeled at their top.
    for (const b of ENGINE_BANDS) {
      const x0 = sx(b.r[0]);
      const x1 = sx(b.r[1]);
      svgEl("rect", { class: "eff-band", x: px(x0), y: plot.top, width: px(x1 - x0), height: px(plot.bottom - plot.top) }, layer.bands);
      // Two lines ("gasoline" / "engines"): the bands are narrow.
      const label = svgEl("text", { class: "eff-band-label", "text-anchor": "middle" }, layer.bands);
      b.label.split(" ").forEach((word, i) => svgEl("tspan", { x: px((x0 + x1) / 2), y: plot.top + 11 + 12 * i, text: word }, label));
    }

    // Axes and grid.
    for (const r of X_TICKS) {
      const x = sx(r);
      if (r !== R_RANGE[0]) svgEl("line", { class: "grid-line", x1: crisp(x), x2: crisp(x), y1: plot.top, y2: plot.bottom }, layer.grid);
      svgEl("text", { class: "tick-label", x: px(x), y: plot.bottom + 16, "text-anchor": "middle", "dominant-baseline": "central", text: String(r) }, layer.axes);
    }
    for (const e of Y_TICKS) {
      const y = sy(e);
      if (e !== 0) svgEl("line", { class: "grid-line", x1: plot.left, x2: plot.right, y1: crisp(y), y2: crisp(y) }, layer.grid);
      svgEl("text", { class: "tick-label", x: plot.left - 8, y: px(y), "text-anchor": "end", "dominant-baseline": "central", text: String(Math.round(e * 100)) }, layer.axes);
    }
    svgEl("line", { class: "axis-line", x1: crisp(plot.left), x2: crisp(plot.left), y1: plot.top, y2: plot.bottom + 0.5 }, layer.axes);
    svgEl("line", { class: "axis-line", x1: plot.left, x2: plot.right, y1: crisp(plot.bottom), y2: crisp(plot.bottom) }, layer.axes);
    labelParts(layer.axes, { class: "axis-title", x: plot.left, y: plot.top - 12, "text-anchor": "middle" }, [["η", "th", " (%)"]]);
    labelParts(layer.axes, { class: "axis-title", x: plot.right, y: plot.bottom + 34, "text-anchor": "end" }, [["", "", "Compression ratio "], ["r", "", ""]]);

    // Curves: references thin and gray, the current one(s) bold.
    const screen = (pts) => pts.map(([r, e]) => [sx(r), sy(clamp(e, 0, 1))]);
    const ends = [];
    for (const c of data.refs) {
      svgEl("path", { class: "eff-ref", d: polyline(screen(c.points)) }, layer.refs);
      ends.push({ c, y: sy(c.points.at(-1)[1]), cls: "eff-label ref" });
    }
    for (const c of data.main) {
      const dashed = c.key === "b";
      svgEl("path", { class: `eff-main${dashed ? " dashed" : ""}`, d: polyline(screen(c.points)), style: `stroke:${paint(c.key)}` }, layer.main);
      ends.push({ c, y: sy(c.points.at(-1)[1]), cls: "eff-label" });
    }
    // Right-end labels, spread apart so they never overlap, with a short leader when moved.
    const ys = spreadLabels(ends.map((e) => e.y), LABEL_GAP, plot.top, plot.bottom);
    ends.forEach((e, i) => {
      const x = plot.right + 6;
      if (Math.abs(ys[i] - e.y) > 2) {
        svgEl("path", { class: "eff-leader", d: `M${px(plot.right + 1)} ${px(e.y)}L${px(x - 1)} ${px(ys[i])}` }, layer.labels);
      }
      labelParts(layer.labels, { class: e.cls, x: px(x + 2), y: px(ys[i]), "dominant-baseline": "central" }, e.c.label);
    });

    // Markers with their values. Values sit above-left of the marker, spread apart vertically.
    const ms = data.markers.filter((m) => m.r >= R_RANGE[0] && m.r <= R_RANGE[1]);
    const valueY = spreadLabels(ms.map((m) => sy(m.eta) - 16), 18, plot.top + 8, plot.bottom - 8);
    ms.forEach((m, i) => {
      const x = sx(m.r);
      const y = sy(m.eta);
      const text = model.mode === "compare" ? `${m.key.toUpperCase()} ${formatValue("eta", m.eta)}` : formatValue("eta", m.eta);
      const w = CHAR_W * text.length + 10;
      const lx = x - w / 2 - 4 < plot.left ? x + 8 : x - 8;
      svgEl("text", { class: "eff-value", x: px(lx), y: px(valueY[i]), "text-anchor": lx > x ? "start" : "end", "dominant-baseline": "central", text }, layer.labels);
      const drag = dragTarget(m.key);
      const circle = svgEl("circle", { class: `eff-marker${drag ? " draggable" : ""}`, cx: px(x), cy: px(y), r: 6, style: `fill:${paint(m.key)}` }, layer.markers);
      markers.push({ key: m.key, x, y, drag, circle });
    });

    // Hover crosshair (positioned on pointer move).
    hover = {
      v: svgEl("line", { class: "eff-cross" }, layer.hover),
      h: svgEl("line", { class: "eff-cross" }, layer.hover),
      dot: svgEl("circle", { class: "eff-hover-dot", r: 4 }, layer.hover),
      badge: svgEl("g", { class: "badge" }, layer.hover),
    };
    hover.rect = svgEl("rect", { height: 20, rx: 4, y: -10 }, hover.badge);
    hover.text = svgEl("text", { "text-anchor": "middle", "dominant-baseline": "central", y: 0.5 }, hover.badge);
    hideHover();

    // Text alternative: the current value(s).
    const said = ms.map((m) => `${model.mode === "compare" ? `cycle ${m.key.toUpperCase()}: ` : ""}r = ${formatValue("ratio", m.r)}, efficiency ${formatValue("eta", m.eta)}`);
    titleEl.textContent = `Thermal efficiency against compression ratio. ${said.join("; ")}`;
  }

  // What dragging a marker changes, or null when its r is not free.
  function dragTarget(key) {
    if (model.mode === "explore") {
      const spec = PARAMS[state.cycle].r;
      return { spec, set: (r) => actions.setParam("params", "r", r) };
    }
    const { constraint } = state.compare;
    if (constraint === "same-r-qin") return { spec: COMPARE.r, set: (r) => actions.setCompareShared("r", r) };
    if (constraint === "independent") {
      const spec = PARAMS[state.compare[key].type].r;
      return { spec, set: (r) => actions.setCompareParam(key, "r", r) };
    }
    return null;
  }

  // ------------------------------------------------------------------ pointer

  const local = (e) => {
    const r = svg.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  function grabbed(x, y) {
    let best = null;
    for (const m of markers) {
      const d = Math.hypot(m.x - x, m.y - y);
      if (m.drag && d <= GRAB_PX && (!best || d < best.d)) best = { m, d };
    }
    return best && best.m;
  }

  // r under the pointer, on the slider's steps and inside its range.
  const rAt = (x, spec) => clampTo(Math.round(sx.invert(x) / spec.step) * spec.step, spec);

  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !plot) return;
    const [x, y] = local(e);
    const m = grabbed(x, y);
    if (!m) return;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    dragging = m.drag;
    svg.classList.add("dragging");
  });

  svg.addEventListener("pointermove", (e) => {
    if (!plot) return;
    const [x, y] = local(e);
    if (dragging) {
      dragging.set(rAt(x, dragging.spec));
      return;
    }
    svg.classList.toggle("grab", Boolean(grabbed(x, y)));
    showHover(x, y);
  });

  const endDrag = () => {
    dragging = null;
    svg.classList.remove("dragging");
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("pointerleave", () => {
    if (!dragging) hideHover();
  });

  // Crosshair at the pointer's r, on the bold curve nearest to the pointer.
  function showHover(x, y) {
    if (!hover || !data.main.length || x < plot.left || x > plot.right || y < plot.top - 4 || y > plot.bottom + 4) return hideHover();
    const r = sx.invert(x);
    let best = null;
    for (const c of data.main) {
      const eta = etaAt(c.points, r);
      const d = Math.abs(sy(eta) - y);
      if (!best || d < best.d) best = { eta, d };
    }
    const yy = sy(clamp(best.eta, 0, 1));
    setLine(hover.v, x, plot.top, x, plot.bottom);
    setLine(hover.h, plot.left, yy, plot.right, yy);
    hover.dot.setAttribute("cx", px(x));
    hover.dot.setAttribute("cy", px(yy));
    const text = `r = ${formatValue("ratio", Math.round(r * 10) / 10)}   η = ${formatValue("eta", best.eta)}`;
    hover.text.textContent = text;
    const w = Math.round(CHAR_W * text.length + 12);
    hover.rect.setAttribute("width", w);
    hover.rect.setAttribute("x", -w / 2);
    const bx = clamp(x, plot.left + w / 2, plot.right - w / 2);
    const by = yy - 22 < plot.top ? yy + 22 : yy - 22;
    hover.badge.setAttribute("transform", `translate(${px(bx)} ${px(by)})`);
    layer.hover.removeAttribute("display");
  }

  function hideHover() {
    layer.hover.setAttribute("display", "none");
  }

  return { render, tick() {} };
}

// η on a curve sampled at evenly spaced r, interpolated.
function etaAt(points, r) {
  const r0 = points[0][0];
  const step = points[1][0] - r0;
  const i = clamp(Math.floor((r - r0) / step), 0, points.length - 2);
  const t = (r - points[i][0]) / step;
  return points[i][1] + t * (points[i + 1][1] - points[i][1]);
}

function setLine(line, x1, y1, x2, y2) {
  line.setAttribute("x1", px(x1));
  line.setAttribute("y1", px(y1));
  line.setAttribute("x2", px(x2));
  line.setAttribute("y2", px(y2));
}

// SVG text from parts [symbol (italic), subscript, plain text after].
function labelParts(parent, attrs, parts) {
  const text = svgEl("text", attrs, parent);
  for (const [sym, sub, rest] of parts) {
    if (sym) svgEl("tspan", { "font-style": "italic", text: sym }, text);
    if (sub) {
      svgEl("tspan", { class: "sub", dy: "0.35em", text: sub }, text);
      svgEl("tspan", { dy: "-0.35em", text: rest || "​" }, text);
    } else if (rest) {
      svgEl("tspan", { text: rest }, text);
    }
  }
  return text;
}
