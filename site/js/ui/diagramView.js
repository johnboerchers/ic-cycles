// One diagram component, used twice (SPEC section 6): P–v (x = v, y = P) and T–s
// (x = s − s1, y = T). It renders at its box's pixel size, so text stays a real 12–13 px, and
// draws every cycle in the model's list on shared axes (one cycle in explore mode).
//
// Besides drawing: the axes rescale with a short transition when a parameter pushes the cycle
// across a "nice" bound; the state point can be dragged along the cycle; hovering a state or a
// process shows its numbers. P–v also has the piston strip and the log-axes switch.

import { linear, logScale, ticks, logTicks } from "../core/scale.js";
import { formatTicks, formatLogTicks, formatValue } from "../core/format.js";
import { labeledStates, phaseSamples } from "../core/model.js";
import { nearestPhase, distanceToPolyline } from "../core/pick.js";
import { energyTerms } from "../core/tables.js";
import { colorRamp } from "../core/scale.js";
import { GAS_RAMP_T } from "../state/defaults.js";
import { CONTENT } from "../content/content.js";
import { svgEl, htmlEl, symbolText, symbolHtml, px, polyline, roleColor, makeSwitch } from "./dom.js";

const KINDS = {
  pv: {
    name: "P–v diagram",
    x: { key: "v", title: [["v", true], [" (m³/kg)"]] },
    y: { key: "P", title: [["P", true], [" (kPa)"]] },
    bounds: (b, log) => (log ? [b.pvLog.v, b.pvLog.P] : [b.pv.v, b.pv.P]),
    canLog: true,
  },
  ts: {
    name: "T–s diagram",
    x: { key: "s", title: [["s", true], [" − "], ["s", true, "1"], [" (kJ/kg·K)"]] },
    y: { key: "T", title: [["T", true], [" (K)"]] },
    bounds: (b) => [b.ts.s, b.ts.T],
    canLog: false,
  },
};

const MARGIN = { top: 28, right: 18, bottom: 44 };
const STRIP = { top: 52, height: 12, bottom: 88 }; // piston strip, px below the v axis
const LABEL_GAP = 13; // state label distance from its marker, px
const ARROW_MIN = 36; // a process shorter than this on screen gets no direction arrow, px
const CHAR_W = 7.2; // a tabular digit at 12 px, to size labels without measuring text
const ARROW_PATH = "M6 0L-5 -4.5L-5 4.5Z"; // direction arrowhead pointing along +x
const RESCALE_MS = 250; // axis transition when a bound changes (SPEC section 6)
const GRAB_PX = 24; // pointer down this close to the cycle starts a drag
const HOVER_MARKER_PX = 10; // hover this close to a state marker shows its tooltip
const HOVER_CURVE_PX = 7; // ... or to a process curve

const crisp = (v) => Math.round(v) + 0.5; // hairlines on the pixel grid
const unit = (dx, dy) => {
  const len = Math.hypot(dx, dy);
  return len > 1e-9 ? [dx / len, dy / len] : [0, 0];
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sameBounds = (a, b) => a && b && a.every((r, i) => r[0] === b[i][0] && r[1] === b[i][1]);
const ease = (t) => t * t * (3 - 2 * t);

const UNITS = { P: "kPa", T: "K", v: "m³/kg", s: "kJ/kg·K" };

let instances = 0;

export function createDiagramView(container, { kind, actions }) {
  const cfg = KINDS[kind];
  const uid = `diagram${++instances}`;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // Title row; P–v gets the log-axes switch at its right end.
  const title = container.querySelector(".panel-title");
  const head = htmlEl("div", { class: "panel-head" });
  container.prepend(head);
  if (title) head.append(title);
  let logBox = null;
  if (cfg.canLog) logBox = makeSwitch(head, "Log axes", (on) => actions.setOption("logAxes", on), "small");

  const box = htmlEl("div", { class: "fill-box" }, container);
  const svg = svgEl("svg", { class: "diagram", role: "img", "aria-labelledby": `${uid}-title` }, box);
  svgEl("title", { id: `${uid}-title`, text: cfg.name }, svg);
  const tip = htmlEl("div", { class: "tooltip", role: "tooltip", hidden: "" }, box);
  // Drawing order, bottom to top.
  const layer = {};
  for (const name of ["grid", "axes", "strip", "drops", "curves", "trails", "arrows", "markers", "labels", "dots", "badges"]) {
    layer[name] = svgEl("g", {}, svg);
  }

  let model = null;
  let lastState = null;
  let lastFrames = null;
  let size = { w: 0, h: 0 };
  let log = false;
  let shown = null; // axis bounds on screen now, [[x0, x1], [y0, y1]]
  let target = null; // axis bounds being moved to
  let tween = null;
  let samples = []; // per cycle: the cycle at 600 phases, for dragging
  let plot = null;
  let sx = null;
  let sy = null;
  let items = []; // one per cycle: its screen geometry and the elements tick moves
  let strip = null;
  let gasColor = () => "#ffffff";
  let dragging = false;

  new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width === size.w && height === size.h) return;
    size = { w: width, h: height };
    if (model) redraw();
  }).observe(box);

  function render(newModel, state) {
    const newLog = cfg.canLog && state.options.logAxes;
    const modeChanged = newLog !== log || !model;
    model = newModel;
    lastState = state;
    log = newLog;
    if (logBox) logBox.checked = log;
    const css = getComputedStyle(document.documentElement);
    gasColor = colorRamp(GAS_RAMP_T.map((T) => [T, css.getPropertyValue(`--gas-${T}`)]));
    samples = model.cycles.map((c) => phaseSamples(c));
    size = { w: box.clientWidth, h: box.clientHeight };

    const next = cfg.bounds(model.bounds, log);
    if (modeChanged || !shown || reduceMotion.matches) {
      cancelTween();
      shown = next;
      target = next;
    } else if (!sameBounds(next, target)) {
      // Crossing a band: move the axes over 250 ms from wherever they are now.
      target = next;
      startTween(shown, next);
    }
    build();
  }

  // ------------------------------------------------------------------ rescale transition

  function startTween(from, to) {
    cancelTween();
    tween = { from, to, t0: performance.now(), raf: requestAnimationFrame(stepTween) };
  }

  function cancelTween() {
    if (tween) cancelAnimationFrame(tween.raf);
    tween = null;
  }

  // Bounds in between, interpolated in log space on log axes so decades move evenly.
  function stepTween(now) {
    const t = Math.min(1, (now - tween.t0) / RESCALE_MS);
    const e = ease(t);
    const mix = (a, b) => (log ? a * (b / a) ** e : a + (b - a) * e);
    shown = tween.from.map((r, i) => [mix(r[0], tween.to[i][0]), mix(r[1], tween.to[i][1])]);
    if (t < 1) tween.raf = requestAnimationFrame(stepTween);
    else { shown = tween.to; tween = null; }
    redraw();
  }

  function redraw() {
    build();
    if (lastFrames) tick(lastFrames, lastState);
  }

  // ------------------------------------------------------------------ drawing

  function build() {
    for (const g of Object.values(layer)) g.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${size.w} ${size.h}`);
    items = [];
    strip = null;
    if (size.w < 120 || size.h < 120 || !shown) return;

    const [bx, by] = shown;
    // Ticks come from the bounds being moved to, placed on the scale shown now, so labels are
    // always nice numbers and slide into place during a rescale.
    const tickSet = (lo, hi, show) => {
      const t = log ? logTicks(lo, hi) : ticks(lo, hi);
      const labels = log ? formatLogTicks(t) : formatTicks(t);
      const span = show[1] - show[0];
      return t.map((v, i) => ({ v, label: labels[i] })).filter((d) => d.v >= show[0] - 1e-9 * span && d.v <= show[1] + 1e-9 * span);
    };
    const xt = tickSet(...target[0], bx);
    const yt = tickSet(...target[1], by);
    const withStrip = cfg.canLog && !log;
    const left = Math.round(Math.max(44, 16 + CHAR_W * Math.max(...yt.map((d) => d.label.length))));
    const bottom = size.h - (withStrip ? STRIP.bottom : MARGIN.bottom);
    plot = { left, right: size.w - MARGIN.right, top: MARGIN.top, bottom };
    const scale = log ? logScale : linear;
    sx = scale(bx, [plot.left, plot.right]);
    sy = scale(by, [plot.bottom, plot.top]);
    drawAxes(bx, by, xt, yt, withStrip);
    items = model.cycles.map((c, i) => drawCycle(c, samples[i]));
    if (withStrip) strip = drawStrip(model.cycles[0]);
  }

  function drawAxes(bx, by, xt, yt, withStrip) {
    for (const { v, label } of xt) {
      const x = sx(v);
      if (Math.abs(x - plot.left) > 0.5) svgEl("line", { class: "grid-line", x1: crisp(x), x2: crisp(x), y1: plot.top, y2: plot.bottom }, layer.grid);
      svgEl("text", { class: "tick-label", x: px(x), y: plot.bottom + 17, "text-anchor": "middle", "dominant-baseline": "central", text: label }, layer.axes);
    }
    for (const { v, label } of yt) {
      const y = sy(v);
      if (Math.abs(y - plot.bottom) > 0.5) svgEl("line", { class: "grid-line", x1: plot.left, x2: plot.right, y1: crisp(y), y2: crisp(y) }, layer.grid);
      svgEl("text", { class: "tick-label", x: plot.left - 8, y: px(y), "text-anchor": "end", "dominant-baseline": "central", text: label }, layer.axes);
    }
    svgEl("line", { class: "axis-line", x1: crisp(plot.left), x2: crisp(plot.left), y1: plot.top, y2: plot.bottom + 0.5 }, layer.axes);
    svgEl("line", { class: "axis-line", x1: plot.left, x2: plot.right, y1: crisp(plot.bottom), y2: crisp(plot.bottom) }, layer.axes);
    axisTitle({ x: plot.left, y: plot.top - 14, "text-anchor": "middle" }, cfg.y.title);
    // A little lower above the strip, clear of the value badge on the tick row.
    axisTitle({ x: plot.right, y: plot.bottom + (withStrip ? 41 : 37), "text-anchor": "end" }, cfg.x.title);
  }

  // An axis title from parts [text, italic, subscript].
  function axisTitle(attrs, parts) {
    const text = svgEl("text", { class: "axis-title", ...attrs }, layer.axes);
    for (const [s, italic, sub] of parts) {
      svgEl("tspan", { "font-style": italic ? "italic" : null, text: s }, text);
      if (sub) {
        svgEl("tspan", { class: "sub", dy: "0.35em", text: sub }, text);
        svgEl("tspan", { dy: "-0.35em", text: "​" }, text);
      }
    }
  }

  function drawCycle(cycle, phases) {
    const { solution, samples: pts } = cycle;
    const drawn = solution.processes.filter((p) => !p.degenerate);
    const screen = {};
    for (const p of drawn) {
      screen[p.id] = pts[p.id].map((pt) => [sx(pt[cfg.x.key]), sy(pt[cfg.y.key]), pt.lambda]);
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
      solution,
      screen,
      corners,
      drawn,
      pick: phases.map((p) => ({ u: p.u, x: sx(p.state[cfg.x.key]), y: sy(p.state[cfg.y.key]) })),
      trail: svgEl("path", { class: "trail" }, layer.trails),
      dropX: svgEl("line", { class: "drop-line" }, layer.drops),
      dropY: svgEl("line", { class: "drop-line" }, layer.drops),
      dot: svgEl("circle", { class: "dot", r: 7 }, layer.dots),
      badgeX: badge(),
      badgeY: badge(),
      role: null,
    };
  }

  // Piston strip (P–v, linear axes): a cylinder from v = 0 to v1 on the v scale, the gas up to
  // the piston face at the current volume, and ticks at TDC (v2) and BDC (v1).
  function drawStrip(cycle) {
    const st = cycle.solution.states;
    const y0 = plot.bottom + STRIP.top;
    const y1 = y0 + STRIP.height;
    const x0 = sx(0);
    const xBdc = sx(st["1"].v);
    const xTdc = sx(st["2"].v);
    const g = layer.strip;
    const gas = svgEl("rect", { class: "strip-gas", x: px(x0), y: y0, height: STRIP.height, width: 0 }, g);
    svgEl("line", { class: "strip-wall", x1: px(x0), x2: px(xBdc + 10), y1: y0 - 0.5, y2: y0 - 0.5 }, g);
    svgEl("line", { class: "strip-wall", x1: px(x0), x2: px(xBdc + 10), y1: y1 + 0.5, y2: y1 + 0.5 }, g);
    svgEl("line", { class: "strip-head", x1: px(x0) - 1, x2: px(x0) - 1, y1: y0 - 2, y2: y1 + 2 }, g);
    for (const [x, label] of [[xTdc, "TDC"], [xBdc, "BDC"]]) {
      svgEl("line", { class: "strip-tick", x1: crisp(x), x2: crisp(x), y1: y1 + 2, y2: y1 + 6 }, g);
      svgEl("text", { class: "strip-label", x: px(x), y: y1 + 14, "text-anchor": "middle", "dominant-baseline": "central", text: label }, g);
    }
    const piston = svgEl("rect", { class: "strip-piston", y: y0 + 0.5, width: 8, height: STRIP.height - 1, rx: 1 }, g);
    return { y0, x0, gas, piston, T: null };
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
      // On P–v with the strip, the drop-line runs on down to the piston face.
      setLine(it.dropX, x, y, x, strip && i === 0 ? strip.y0 : plot.bottom);
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

    if (strip) {
      const f = frames[0];
      const xp = sx(f.vCyl);
      strip.gas.setAttribute("width", px(Math.max(0, xp - strip.x0)));
      strip.piston.setAttribute("x", px(xp));
      const T = Math.round(f.state.T);
      if (strip.T !== T) {
        strip.gas.style.fill = gasColor(T);
        strip.T = T;
      }
    }
  }

  // ------------------------------------------------------------------ pointer: drag and hover

  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !items.length) return;
    const [x, y] = local(e);
    const hit = nearest(x, y);
    if (!hit || hit.dist > GRAB_PX) return;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    dragging = true;
    svg.classList.add("dragging");
    hideTip();
    actions.scrub(hit.u);
  });

  svg.addEventListener("pointermove", (e) => {
    if (!items.length) return;
    const [x, y] = local(e);
    if (dragging) {
      actions.scrub(nearest(x, y).u);
      return;
    }
    const hit = nearest(x, y);
    svg.classList.toggle("grab", Boolean(hit && hit.dist <= GRAB_PX));
    hover(x, y);
  });

  const endDrag = () => {
    dragging = false;
    svg.classList.remove("dragging");
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("pointerleave", () => {
    if (!dragging) hideTip();
  });

  // Pointer position in the SVG's own coordinates (its viewBox is its pixel size).
  function local(e) {
    const r = svg.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  // The phase nearest to the pointer over all cycles: { u, dist }.
  function nearest(x, y) {
    let best = null;
    for (const it of items) {
      const hit = nearestPhase(it.pick, x, y);
      if (!best || hit.dist < best.dist) best = hit;
    }
    return best;
  }

  function hover(x, y) {
    for (const it of items) {
      for (const c of it.corners) {
        if (Math.hypot(c.x - x, c.y - y) <= HOVER_MARKER_PX) return showStateTip(it.solution, c, x, y);
      }
    }
    for (const it of items) {
      for (const p of it.drawn) {
        if (distanceToPolyline(it.screen[p.id], x, y) <= HOVER_CURVE_PX) return showProcessTip(p, x, y);
      }
    }
    hideTip();
  }

  function showStateTip(solution, corner, x, y) {
    const key = `state ${corner.name}`;
    if (tip.dataset.key !== key) {
      tip.replaceChildren();
      htmlEl("div", { class: "tooltip-title", text: `State ${corner.name}` }, tip);
      const st = solution.states[corner.name];
      const dl = htmlEl("dl", {}, tip);
      for (const q of ["P", "T", "v", "s"]) {
        const dt = htmlEl("dt", {}, dl);
        symbolHtml(dt, q);
        if (q === "s") { dt.append(" − "); symbolHtml(dt, "s", "1"); }
        htmlEl("dd", { text: `${formatValue(q, st[q])} ${UNITS[q]}` }, dl);
      }
      tip.dataset.key = key;
    }
    placeTip(x, y);
  }

  function showProcessTip(process, x, y) {
    const key = `process ${process.id}`;
    if (tip.dataset.key !== key) {
      tip.replaceChildren();
      const t = htmlEl("div", { class: "tooltip-title" }, tip);
      htmlEl("span", { class: "chip", style: `background:${roleColor(process.role)}` }, t);
      t.append(`${process.id.replace("-", "→")} ${CONTENT.roles[process.role].label}`);
      const terms = energyTerms(process);
      const dl = htmlEl("dl", {}, tip);
      for (const sym of ["q", "w"]) {
        const { sub, value } = terms[sym];
        symbolHtml(htmlEl("dt", {}, dl), sym, sub);
        htmlEl("dd", { text: sub ? `${formatValue(sym, value)} kJ/kg` : "0" }, dl);
      }
      tip.dataset.key = key;
    }
    placeTip(x, y);
  }

  // Next to the pointer, kept inside the diagram box.
  function placeTip(x, y) {
    tip.hidden = false;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = x + 14 + w > size.w ? x - 14 - w : x + 14;
    const top = clamp(y - h - 10 < 0 ? y + 14 : y - h - 10, 0, Math.max(0, size.h - h));
    tip.style.transform = `translate(${Math.round(Math.max(0, left))}px, ${Math.round(top)}px)`;
  }

  function hideTip() {
    tip.hidden = true;
    delete tip.dataset.key;
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
