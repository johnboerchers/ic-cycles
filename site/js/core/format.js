// Every number shown on screen is formatted here (PHYSICS.md section 11).
//   formatValue(quantity, x)  text for the page: "689.2", "4811", "56.5 %", "−12.0", "—"
//   formatTex(quantity, x)    for \val{…} in equations: trailing zeros trimmed, "56.5\%"
//   formatTicks(values)       axis tick labels with the decimals their step needs
// Quantities: T, P, v, s, q, w, u, mep, eta, ratio, k, cv, cp.

export const MINUS = "−";
export const MISSING = "—";

const fixed = (d) => (x) => x.toFixed(d);

// n significant figures, without exponent notation.
function significant(x, n) {
  const rounded = Number(x.toPrecision(n));
  if (rounded === 0) return (0).toFixed(n - 1);
  const decimals = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(rounded))));
  return rounded.toFixed(decimals);
}

const trimZeros = (s) => (s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s);

const FORMATS = {
  T: fixed(1),
  P: (x) => (Math.abs(x) >= 1000 ? x.toFixed(0) : significant(x, 4)),
  v: (x) => significant(x, 4),
  s: fixed(4),
  q: fixed(1),
  w: fixed(1),
  u: fixed(1),
  mep: fixed(1),
  eta: (x) => (100 * x).toFixed(1),
  ratio: (x) => trimZeros(x.toFixed(3)),
  k: (x) => trimZeros(x.toFixed(3)),
  cv: fixed(4),
  cp: fixed(4),
};

// Digits with "-" for negatives; a value that rounds to zero loses its sign.
function digits(quantity, x) {
  const fmt = FORMATS[quantity];
  if (!fmt) throw new Error(`unknown quantity ${quantity}`);
  const s = fmt(x);
  return /^-[0.]*$/.test(s) ? s.slice(1) : s;
}

const exists = (x) => typeof x === "number" && Number.isFinite(x);

export function formatValue(quantity, x) {
  if (!exists(x)) return MISSING;
  const s = digits(quantity, x).replace("-", MINUS);
  return quantity === "eta" ? `${s} %` : s;
}

// TeX keeps an ASCII "-", which TeX typesets as a minus sign.
export function formatTex(quantity, x) {
  if (!exists(x)) return `\\text{${MISSING}}`;
  const s = trimZeros(digits(quantity, x));
  return quantity === "eta" ? `${s}\\%` : s;
}

// Decimals needed to write `step` exactly: 0.25 -> 2, 0.3 -> 1, 1500 -> 0.
function decimalsFor(step) {
  for (let d = 0; d < 10; d++) {
    const scaled = Math.abs(step) * 10 ** d;
    if (Math.abs(scaled - Math.round(scaled)) <= 1e-6 * Math.max(1, scaled)) return d;
  }
  return 10;
}

// Labels for evenly spaced axis ticks: every label gets the decimals the step needs
// ("0.25", "0.50", "0.75"), zero is written "0", negatives get a true minus sign.
export function formatTicks(values) {
  const step = values.length > 1 ? values[1] - values[0] : 1;
  const d = decimalsFor(step);
  return values.map((x) => {
    if (!exists(x)) return MISSING;
    if (Math.abs(x) <= 1e-9 * Math.abs(step)) return "0";
    return x.toFixed(d).replace("-", MINUS);
  });
}
