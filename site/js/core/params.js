// Parameter input (SPEC section 8): parsing what is typed in a number box, and the range
// rules. The ranges themselves are in state/defaults.js.

// A complete number typed by a student, or null while the input is incomplete or not a number
// ("", "-", ".", "1e"). A decimal comma is accepted as a decimal point.
export function parseNumber(text) {
  const s = String(text).trim().replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  return Number(s);
}

export const inRange = (x, { min, max }) => x >= min && x <= max;

export const clampTo = (x, { min, max }) => Math.min(max, Math.max(min, x));
