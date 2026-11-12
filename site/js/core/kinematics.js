// Slider-crank piston motion (PHYSICS.md section 5).
// Crank angle theta = 0 at TDC and pi at BDC; xhat = 0 at TDC and 1 at BDC.

export const RHO = 3; // connecting-rod length / crank radius

export function xhat(theta) {
  const s = Math.sin(theta);
  return ((1 - Math.cos(theta)) + RHO - Math.sqrt(RHO * RHO - s * s)) / 2;
}

// Inverse of xhat on the down-stroke branch, theta in [0, pi].
export function thetaFromXhat(x) {
  const d = RHO + 1 - 2 * x;
  const c = (1 + d * d - RHO * RHO) / (2 * d);
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

export function smoothstep(t) {
  return t * t * (3 - 2 * t);
}
