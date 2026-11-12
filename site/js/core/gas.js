// The working gas: an ideal gas with constant specific heats (cold-air standard).
// cv and cp are derived from R and k, never hard-coded, so cp - cv = R and cp/cv = k hold
// exactly (PHYSICS.md section 1).

export const R_AIR = 0.287; // kJ/(kg·K)

export function makeGas({ k = 1.4, R = R_AIR } = {}) {
  const cv = R / (k - 1);
  return { k, R, cv, cp: k * cv };
}
