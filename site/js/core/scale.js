// Scales for the diagrams and the engine (SPEC sections 6 and 16): "nice" axis bounds, tick
// values, linear maps, and the color ramp for the gas temperature.

// Axis upper bounds come from this series times a power of ten.
export const NICE_SERIES = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
export const HEADROOM = 1.05; // the bound is the nice number above 1.05 x the maximum

// Strips binary noise such as 0.30000000000000004, and turns -0 into 0.
const clean = (x) => Number(x.toPrecision(12)) + 0;

// The smallest value of the series (times a power of ten) that is >= x, for x > 0.
export function niceUpper(x) {
  if (!(x > 0) || !Number.isFinite(x)) throw new RangeError(`niceUpper needs x > 0, got ${x}`);
  let n = Math.floor(Math.log10(x));
  let m = x / 10 ** n;
  if (m < 1) { n -= 1; m *= 10; } // log10 can land a hair off at exact powers of ten
  if (m >= 10) { n += 1; m /= 10; }
  for (const s of NICE_SERIES) if (s >= m * (1 - 1e-12)) return clean(s * 10 ** n);
  return clean(10 ** (n + 1));
}

// Axis upper bound for a data maximum.
export function niceBound(max) {
  return niceUpper(HEADROOM * max);
}

// Steps tried for the ticks. 1.5 and 3 are allowed so that bounds such as 6000 or 1.2 get
// five evenly spaced ticks that end on the bound, but they are slightly disfavored.
const STEP_MANTISSAS = [1, 1.5, 2, 2.5, 3, 5];

// About `target` evenly spaced tick values inside [lo, hi], preferring a set that ends exactly
// on hi so the top grid line carries a label.
export function ticks(lo, hi, target = 5) {
  if (!(hi > lo)) return [lo];
  const base = 10 ** Math.floor(Math.log10((hi - lo) / target));
  const tol = 1e-9 * Math.max(Math.abs(lo), Math.abs(hi));
  let best = null;
  for (const e of [base / 10, base, base * 10]) {
    for (const m of STEP_MANTISSAS) {
      const step = m * e;
      const first = Math.ceil((lo - tol) / step);
      const last = Math.floor((hi + tol) / step);
      const count = last - first + 1;
      if (count < 2) continue;
      const endsOnHi = Math.abs(last * step - hi) <= tol;
      const score = Math.abs(count - target) + (endsOnHi ? 0 : 0.6) + (m === 1.5 || m === 3 ? 0.3 : 0);
      if (!best || score < best.score) best = { score, step, first, last };
    }
  }
  const out = [];
  for (let i = best.first; i <= best.last; i++) out.push(clean(i * best.step));
  return out;
}

// Linear map from a domain [d0, d1] to a range [r0, r1], with .invert.
export function linear([d0, d1], [r0, r1]) {
  const k = (r1 - r0) / (d1 - d0);
  const f = (x) => r0 + (x - d0) * k;
  f.invert = (y) => d0 + (y - r0) / k;
  f.domain = [d0, d1];
  f.range = [r0, r1];
  return f;
}

// The timeline bar: phase u in [0, 1] -> x, for segments [u0, u1) laid side by side with widths
// proportional to their share of the phase and a fixed gap between neighbors (SPEC section 7).
// f.invert(x) -> u; a point in a gap maps to the boundary there, and the right end stays just
// short of 1 so that it reads as the end of the last process, not the start of the next cycle.
export function segmentedScale(spans, [x0, x1], gap) {
  const total = spans.reduce((sum, s) => sum + (s.u1 - s.u0), 0);
  const free = Math.max(0, x1 - x0 - gap * (spans.length - 1));
  let x = x0;
  const parts = spans.map(({ u0, u1 }) => {
    const w = (free * (u1 - u0)) / total;
    const part = { u0, u1, x0: x, x1: x + w };
    x += w + gap;
    return part;
  });
  const END = 1 - 1e-9;
  const f = (u) => {
    let p = parts[0];
    for (const q of parts) if (q.u0 <= u) p = q;
    const t = Math.min(1, Math.max(0, (u - p.u0) / (p.u1 - p.u0)));
    return p.x0 + t * (p.x1 - p.x0);
  };
  f.invert = (xq) => {
    if (xq <= parts[0].x0) return parts[0].u0;
    for (const p of parts) {
      if (xq < p.x0) return p.u0; // in the gap before this segment
      if (xq <= p.x1) return Math.min(END, p.u0 + ((xq - p.x0) / (p.x1 - p.x0)) * (p.u1 - p.u0));
    }
    return END;
  };
  f.parts = parts;
  return f;
}

function parseHex(hex) {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex color: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

const toHex = (rgb) => "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");

// Color ramp through stops [[x, "#rrggbb"], ...] given in increasing x: interpolated linearly
// in RGB between stops and clamped at both ends. Returns x -> "#rrggbb".
export function colorRamp(stops) {
  const pts = stops.map(([x, hex]) => [x, parseHex(hex)]);
  return (x) => {
    if (!(x > pts[0][0])) return toHex(pts[0][1]); // also catches NaN
    const lastStop = pts[pts.length - 1];
    if (x >= lastStop[0]) return toHex(lastStop[1]);
    let i = 1;
    while (pts[i][0] < x) i++;
    const [x0, c0] = pts[i - 1], [x1, c1] = pts[i];
    const t = (x - x0) / (x1 - x0);
    return toHex(c0.map((c, j) => c + t * (c1[j] - c)));
  };
}

// The largest value of the series (times a power of ten) that is <= x, for x > 0.
export function niceLower(x) {
  if (!(x > 0) || !Number.isFinite(x)) throw new RangeError(`niceLower needs x > 0, got ${x}`);
  let n = Math.floor(Math.log10(x));
  let m = x / 10 ** n;
  if (m < 1) { n -= 1; m *= 10; }
  if (m >= 10) { n += 1; m /= 10; }
  let best = 1;
  for (const s of NICE_SERIES) if (s <= m * (1 + 1e-12)) best = s;
  return clean(best * 10 ** n);
}

// Logarithmic map from a domain [d0, d1] (both > 0) to a range [r0, r1], with .invert.
export function logScale([d0, d1], [r0, r1]) {
  const l0 = Math.log(d0);
  const k = (r1 - r0) / (Math.log(d1) - l0);
  const f = (x) => r0 + (Math.log(x) - l0) * k;
  f.invert = (y) => Math.exp(l0 + (y - r0) / k);
  f.domain = [d0, d1];
  f.range = [r0, r1];
  return f;
}

// Ticks for a log axis: 1, 2, 5 x 10^n inside [lo, hi]. A span of many decades keeps only the
// powers of ten; a span under one decade adds the rest of the nice series.
export function logTicks(lo, hi) {
  const pick = (mantissas) => {
    const out = [];
    for (let n = Math.floor(Math.log10(lo)) - 1; n <= Math.ceil(Math.log10(hi)); n++) {
      for (const m of mantissas) {
        const t = clean(m * 10 ** n);
        if (t >= lo * (1 - 1e-9) && t <= hi * (1 + 1e-9)) out.push(t);
      }
    }
    return out;
  };
  let out = pick([1, 2, 5]);
  if (out.length > 8) out = pick([1]);
  if (out.length < 3) out = pick([1, 1.5, 2, 3, 4, 5, 6, 8]);
  return out;
}
