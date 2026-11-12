// One diagram component (SPEC section 6): P–v in this milestone, T–s added in M3 as a second
// configuration. It renders at its box's pixel size, so text stays a real 12–13 px, and draws
// every cycle in the model's list on shared axes (one cycle in explore mode).

import { linear, ticks } from "../core/scale.js";
import { formatTicks, formatValue } from "../core/format.js";
import { labeledStates } from "../core/model.js";
import { svgEl, htmlEl, symbolText, px, polyline, roleColor } from "./dom.js";

const KINDS = {
  pv: {
    name: "P–v diagram",
    x: { key: "v", symbol: "v", unit: "m³/kg" },
    y: { key: "P", symbol: "P", unit: "kPa" },
    bounds: (b) => [b.pv.v, b.pv.P],
  },
};

const MARGIN = { top: 28, right: 18, bottom: 44 };
const LABEL_GAP = 13; // state label distance from its marker, px
const ARROW_MIN = 36; // a process shorter than this on screen gets no direction arrow, px
const CHAR_W = 7.2; // a tabular digit at 12 px, to size labels without measuring text
const ARROW_PATH = "M6 0L-5 -4.5L-5 4.5Z"; // direction arrowhead pointing along +x

const crisp = (v) => Math.round(v) + 0.5; // hairlines on the pixel grid
const unit = (dx, dy) => {
  const len = Math.hypot(dx, dy);
  return len > 1e-9 ? [dx / len, dy / len] : [0, 0];
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

let instances = 0;

export function createDiagramView(container, { kind }) {
  const cfg = KINDS[kind];
  const uid = `diagram${++instances}`;
  const box = htmlEl("div", { class: "fill-box" }, container);
  const svg = svgEl("svg", { class: "diagram", role: "img", "aria-labelledby": `${uid}-title` }, box);
  svgEl("title", { id: `${uid}-title`, text: cfg.name }, svg);
  // Drawing order, bottom to top.
  const layer = {};
  for (const name of ["grid", "axes", "drops", "curves", "trails", "arrows", "markers", "labels", "dots", "badges"]) {
    layer[name] = svgEl("g", {}, svg);
  }

  let model = null;
  let lastState = null;
  let lastFrames = null;
  let size = { w: 0, h: 0 };
  let plot = null;
  let sx = null;
  let sy = null;
  let items = []; // one per cycle: its screen polylines and the elements tick moves

  new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width === size.w && height === size.h) return;
    size = { w: width, h: height };
    if (model) {
      build();
      if (lastFrames) tick(lastFrames, lastState);
    }
  }).observe(box);

  function render(newModel, state) {
    model = newModel;
    lastState = state;
    size = { w: box.clientWidth, h: box.clientHeight };
    build();
  }

  function build() {
    for (const g of Object.values(layer)) g.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${size.w} ${size.h}`);
    items = [];
    if (size.w < 120 || size.h < 120) return;

    const [bx, by] = cfg.bounds(model.bounds);
    const xt = ticks(...bx);
    const yt = ticks(...by);
    const xl = formatTicks(xt);
    const yl = formatTicks(yt);
    const left = Math.round(Math.max(44, 16 + CHAR_W * Math.max(...yl.map((s) => s.length))));
    plot = { left, right: size.w - MARGIN.right, top: MARGIN.top, bottom: size.h - MARGIN.bottom };
    sx = linear(bx, [plot.left, plot.right]);
    sy = linear(by, [plot.bottom, plot.top]);
    drawAxes(bx, by, xt, yt, xl, yl);
    items = model.cycles.map((c) => drawCycle(c));
  }

  function drawAxes(bx, by, xt, yt, xl, yl) {
    xt.forEach((t, i) => {
      const x = sx(t);
      if (t !== bx[0]) svgEl("line", { class: "grid-line", x1: crisp(x), x2: crisp(x), y1: plot.top, y2: plot.bottom }, layer.grid);
      svgEl("text", { class: "tick-label", x: px(x), y: plot.bottom + 17, "text-anchor": "middle", "dominant-baseline": "central", text: xl[i] }, layer.axes);
    });
    yt.forEach((t, i) => {
      const y = sy(t);
      if (t !== by[0]) svgEl("line", { class: "grid-line", x1: plot.left, x2: plot.right, y1: crisp(y), y2: crisp(y) }, layer.grid);
      svgEl("text", { class: "tick-label", x: plot.left - 8, y: px(y), "text-anchor": "end", "dominant-baseline": "central", text: yl[i] }, layer.axes);
    });
    svgEl("line", { class: "axis-line", x1: crisp(plot.left), x2: crisp(plot.left), y1: plot.top, y2: plot.bottom + 0.5 }, layer.axes);
    svgEl("line", { class: "axis-line", x1: plot.left, x2: plot.right, y1: crisp(plot.bottom), y2: crisp(plot.bottom) }, layer.axes);
    symbolText(layer.axes, { class: "axis-title", x: plot.left, y: plot.top - 14, "text-anchor": "middle" }, cfg.y.symbol, { after: ` (${cfg.y.unit})` });
    symbolText(layer.axes, { class: "axis-title", x: plot.right, y: plot.bottom + 37, "text-anchor": "end" }, cfg.x.symbol, { after: ` (${cfg.x.unit})` });
  }

  function drawCycle(cycle) {
    const { solution, samples } = cycle;
    const drawn = solution.processes.filter((p) => !p.degenerate);
    const screen = {};
    for (const p of drawn) {
      screen[p.id] = samples[p.id].map((pt) => [sx(pt[cfg.x.key]), sy(pt[cfg.y.key]), pt.lambda]);
    }

    // One curve per process in its role color, with an arrowhead at its middle.
    for (const p of drawn) {
      svgEl("path", { class: "curve", d: polyline(screen[p.id]), style: `stroke:${roleColor(p.role)}` }, layer.curves);
      const mid = midpoint(screen[p.id]);
      if (mid) {
        svgEl("path", { d: ARROW_PATH, transform: `translate(${px(mid.x)} ${px(mid.y)}) rotate(${px(mid.angle)})`, style: `fill:${roleColor(p.role)}` }, layer.arrows);
      }
    }

    // State markers and labels at the corners of the loop, the labels pushed away from it.
    const names = new Set(labeledStates(solution));
    const corners = drawn.map((p, i) => {
      const prev = drawn[(i - 1 + drawn.length) % drawn.length];
      const [x, y] = screen[p.id][0];
      return { name: names.has(p.from) ? p.from : prev.to, x, y, before: screen[prev.id], after: screen[p.id] };
    });
    const cx = corners.reduce((a, c) => a + c.x, 0) / corners.length;
    const cy = corners.reduce((a, c) => a + c.y, 0) / corners.length;
    for (const c of corners) {
      svgEl("circle", { class: "marker", cx: px(c.x), cy: px(c.y), r: 4 }, layer.markers);
      const [dx, dy] = outward(c, alongFromEnd(c.before), alongFromStart(c.after), cx, cy);
      const lx = clamp(c.x + dx * LABEL_GAP, plot.left + 8, plot.right - 4);
      const ly = clamp(c.y + dy * LABEL_GAP, plot.top + 6, plot.bottom - 7);
      svgEl("text", { class: "state-label", x: px(lx), y: px(ly), "text-anchor": "middle", "dominant-baseline": "central", text: c.name }, layer.labels);
    }

    // The moving parts: trail, drop-lines, state point, and the value at each axis.
    return {
      screen,
      trail: svgEl("path", { class: "trail" }, layer.trails),
      dropX: svgEl("line", { class: "drop-line" }, layer.drops),
      dropY: svgEl("line", { class: "drop-line" }, layer.drops),
      dot: svgEl("circle", { class: "dot", r: 7 }, layer.dots),
      badgeX: badge(),
      badgeY: badge(),
      role: null,
    };
  }

  function badge() {
    const g = svgEl("g", { class: "badge" }, layer.badges);
    const rect = svgEl("rect", { height: 20, rx: 4, y: -10 }, g);
    const text = svgEl("text", { "text-anchor": "middle", "dominant-baseline": "central", y: 0.5 }, g);
    return { g, rect, text, shown: null };
  }

  // Writes the value into a badge, sized from its character count (no text measuring per frame).
  function setBadge(b, value, x, y, anchor) {
    if (b.shown !== value) {
      b.text.textContent = value;
      b.w = Math.round(CHAR_W * value.length + 12);
      b.rect.setAttribute("width", b.w);
      b.rect.setAttribute("x", -b.w / 2);
      b.shown = value;
    }
    const cxPos = anchor === "end" ? x - b.w / 2 : clamp(x, b.w / 2 + 1, size.w - b.w / 2 - 1);
    b.g.setAttribute("transform", `translate(${px(cxPos)} ${px(y)})`);
  }

  function tick(frames, state) {
    lastFrames = frames;
    lastState = state;
    items.forEach((it, i) => {
      const f = frames[i];
      const valueX = f.state[cfg.x.key];
      const valueY = f.state[cfg.y.key];
      const x = sx(valueX);
      const y = sy(valueY);
      it.dot.setAttribute("cx", px(x));
      it.dot.setAttribute("cy", px(y));
      setLine(it.dropX, x, y, x, plot.bottom);
      setLine(it.dropY, plot.left, y, x, y);

      // Trail: the part of the current process already covered, 2 px thicker than the curve.
      const pts = it.screen[f.processId];
      if (pts) {
        let d = `M${px(pts[0][0])} ${px(pts[0][1])}`;
        for (let j = 1; j < pts.length && pts[j][2] < f.lambda; j++) d += `L${px(pts[j][0])} ${px(pts[j][1])}`;
        it.trail.setAttribute("d", `${d}L${px(x)} ${px(y)}`);
        if (it.role !== f.role) {
          it.trail.style.stroke = roleColor(f.role);
          it.role = f.role;
        }
      } else {
        it.trail.setAttribute("d", "");
      }

      setBadge(it.badgeX, formatValue(cfg.x.key, valueX), x, plot.bottom + 17, "middle");
      setBadge(it.badgeY, formatValue(cfg.y.key, valueY), plot.left - 5, clamp(y, plot.top - 8, plot.bottom + 8), "end");
    });
  }

  return { render, tick };
}

function setLine(line, x1, y1, x2, y2) {
  line.setAttribute("x1", px(x1));
  line.setAttribute("y1", px(y1));
  line.setAttribute("x2", px(x2));
  line.setAttribute("y2", px(y2));
}

// Position and direction (degrees) halfway along a polyline, or null when it is too short.
function midpoint(poly) {
  const lens = [];
  let total = 0;
  for (let i = 1; i < poly.length; i++) {
    const l = Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
    lens.push(l);
    total += l;
  }
  if (total < ARROW_MIN) return null;
  let rest = total / 2;
  for (let i = 0; i < lens.length; i++) {
    if (rest <= lens[i] && lens[i] > 0) {
      const t = rest / lens[i];
      const [x0, y0] = poly[i];
      const [x1, y1] = poly[i + 1];
      return { x: x0 + t * (x1 - x0), y: y0 + t * (y1 - y0), angle: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI };
    }
    rest -= lens[i];
  }
  return null;
}

// A point about 10 px along a polyline from its start (or back from its end): the direction in
// which the curve leaves (or reaches) a corner.
function alongFromStart(poly) {
  const [x0, y0] = poly[0];
  for (const p of poly) if (Math.hypot(p[0] - x0, p[1] - y0) >= 10) return p;
  return poly[poly.length - 1];
}

function alongFromEnd(poly) {
  const [x0, y0] = poly[poly.length - 1];
  for (let i = poly.length - 1; i >= 0; i--) {
    if (Math.hypot(poly[i][0] - x0, poly[i][1] - y0) >= 10) return poly[i];
  }
  return poly[0];
}

// Unit vector pointing away from the curve at a corner: opposite to the two directions in which
// the curve leaves it. Where the curve runs straight through, go sideways, away from the loop.
function outward(corner, before, after, cx, cy) {
  const u = unit(before[0] - corner.x, before[1] - corner.y);
  const w = unit(after[0] - corner.x, after[1] - corner.y);
  let d = [-(u[0] + w[0]), -(u[1] + w[1])];
  if (Math.hypot(d[0], d[1]) < 0.35) {
    const t = u[0] || u[1] ? u : w;
    d = [-t[1], t[0]];
    if (d[0] * (corner.x - cx) + d[1] * (corner.y - cy) < 0) d = [-d[0], -d[1]];
  }
  return unit(d[0], d[1]);
}
