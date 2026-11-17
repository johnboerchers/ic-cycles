// Compare-mode solvers (PHYSICS.md section 7).

import { ratiosFor, ratiosFromHeat } from "./cycle.js";

// Compression ratio that gives peak pressure Pmax for heat input qin, or null if Pmax is too
// low for that heat input. P3(r) = P1·r·Tx(r)/T1 increases with r (PHYSICS.md section 12.3),
// so bisect. Tx is the temperature after the constant-volume part of the heat; Tx >= T1 for
// r >= 1, so P3 >= P1·r and the answer lies below Pmax/P1.
export function solveRForPmax({ Pmax, qin, xv }, P1, T1, gas) {
  const f = (r) => {
    const T2 = gas.isentropicT(T1, 1 / r);
    const Tx = xv * qin > 0 ? gas.TfromU(gas.u(T2) + xv * qin) : T2;
    return (P1 * r * Tx) / T1 - Pmax;
  };
  let lo = 1, hi = Pmax / P1;
  if (f(lo) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  return 0.5 * (lo + hi);
}

// Fraction of the heat added at constant volume. Otto and Diesel are fixed by their type,
// so a leftover slider value from a dual side cannot turn them into something else.
function xvOf(side) {
  if (side.type === "otto") return 1;
  if (side.type === "diesel") return 0;
  return side.xv;
}

// {r, rp, rc} for one side of a comparison, or null when no cycle meets the constraint.
export function sideRatios(constraint, shared, side, P1, T1, gas) {
  const xv = xvOf(side);
  if (constraint === "same-r-qin") return ratiosFromHeat({ r: shared.r, qin: shared.qin, xv }, T1, gas);
  if (constraint === "same-pmax-qin") {
    const r = solveRForPmax({ Pmax: shared.Pmax, qin: shared.qin, xv }, P1, T1, gas);
    return r === null ? null : ratiosFromHeat({ r, qin: shared.qin, xv }, T1, gas);
  }
  if (constraint === "independent") return ratiosFor(side.type, side.params, T1, gas);
  throw new Error(`unknown constraint ${constraint}`);
}
