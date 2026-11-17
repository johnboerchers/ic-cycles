// The working gas (PHYSICS.md sections 1 and 12). Two models share one interface, so the cycle
// code never asks which one it has:
//   makeGas({ k, R })  an ideal gas with constant specific heats (cold-air standard)
//   makeAir()          air whose specific heats depend on temperature (air standard)
// Members, for both: kind, R, cpAt(T), cvAt(T), kAt(T), u(T), h(T), sT(T), TfromU(u),
// TfromH(h), isentropicT(Ta, vRatio). The constant gas also keeps k, cv and cp as numbers.

export const R_AIR = 0.287; // kJ/(kg·K)

// ---------------------------------------------------------------------- constant specific heats
// cv and cp are derived from R and k, never hard-coded, so cp - cv = R and cp/cv = k hold
// exactly (PHYSICS.md section 1).

export function makeGas({ k = 1.4, R = R_AIR } = {}) {
  const cv = R / (k - 1);
  const cp = k * cv;
  return {
    kind: "constant",
    k, R, cv, cp,
    cpAt: () => cp,
    cvAt: () => cv,
    kAt: () => k,
    u: (T) => cv * T,
    h: (T) => cp * T,
    sT: (T) => cp * Math.log(T),
    TfromU: (u) => u / cv,
    TfromH: (h) => h / cp,
    // vRatio = vb / va
    isentropicT: (Ta, vRatio) => Ta * vRatio ** (1 - k),
  };
}

// ---------------------------------------------------------------------- air, variable specific heats
// NASA 7-coefficient polynomials of air, copied verbatim from PHYSICS.md section 12.1
// ([a1 … a7]; the fixture holds the same numbers under air.low and air.high).
export const AIR_LOW = [3.3922816090200003, 0.00047173829780000013, -1.0314739665050002e-06, 2.376663590645e-09, -1.229380909685e-12, 12.958819478564692, 3.893083723035]; // T <= 1000 K
export const AIR_HIGH = [2.9970621894800002, 0.0014725191250700002, -6.026600779555001e-07, 1.227217539765e-10, -9.8132542451e-15, 84.42179061287595, 5.854397014870135]; // T > 1000 K

const T_MID = 1000; // K, where the polynomial row changes
const T_LO = 200; // K, the polynomials are used from here to T_HI; outside, cp is held constant
const T_HI = 3500;

// Newton's method for an increasing function f with derivative df, solving f(T) = target.
// A bracket [lo, hi] is kept; a Newton step that would leave it becomes a bisection step.
// `guess` is the starting temperature (PHYSICS.md section 12.2).
function solveIncreasing(f, df, target, guess) {
  let lo = 1, hi = 1e5;
  let T = Math.min(Math.max(guess, lo), hi);
  for (let i = 0; i < 200; i++) {
    const err = f(T) - target;
    if (err < 0) lo = T;
    else hi = T;
    let next = T - err / df(T);
    if (!(next > lo && next < hi)) next = 0.5 * (lo + hi);
    const done = Math.abs(next - T) < 1e-12 * T;
    T = next;
    if (done) break;
  }
  return T;
}

export function makeAir() {
  const R = R_AIR;
  const row = (T) => (T <= T_MID ? AIR_LOW : AIR_HIGH);

  // The polynomial formulas of PHYSICS.md section 12.1, valid for T_LO <= T <= T_HI. Written in
  // the same order as the table (and the Python reference), so the rounding agrees too.
  const cpPoly = (T) => {
    const a = row(T);
    return R * (a[0] + a[1] * T + a[2] * T ** 2 + a[3] * T ** 3 + a[4] * T ** 4);
  };
  const hPoly = (T) => {
    const a = row(T);
    return R * (T * (a[0] + (a[1] * T) / 2 + (a[2] * T ** 2) / 3 + (a[3] * T ** 3) / 4 + (a[4] * T ** 4) / 5) + a[5]);
  };
  const sPoly = (T) => {
    const a = row(T);
    return R * (a[0] * Math.log(T) + a[1] * T + (a[2] * T ** 2) / 2 + (a[3] * T ** 3) / 3 + (a[4] * T ** 4) / 4 + a[6]);
  };

  // Outside [T_LO, T_HI] cp is held at its value at the nearer edge Tb, so every function is
  // defined and continuous for all T > 0.
  const edge = (T) => (T < T_LO ? T_LO : T_HI);
  const inside = (T) => T >= T_LO && T <= T_HI;

  const cpAt = (T) => (inside(T) ? cpPoly(T) : cpPoly(edge(T)));
  const cvAt = (T) => cpAt(T) - R;
  const kAt = (T) => {
    const cp = cpAt(T);
    return cp / (cp - R);
  };
  const h = (T) => {
    if (inside(T)) return hPoly(T);
    const Tb = edge(T);
    return hPoly(Tb) + cpPoly(Tb) * (T - Tb);
  };
  const u = (T) => h(T) - R * T;
  const sT = (T) => {
    if (inside(T)) return sPoly(T);
    const Tb = edge(T);
    return sPoly(Tb) + cpPoly(Tb) * Math.log(T / Tb);
  };
  // ψ(T) = s°(T) − R ln T, with ψ' = cv/T > 0: constant along an isentrope up to −R ln v.
  const psi = (T) => sT(T) - R * Math.log(T);

  // Starting guesses use the constant-k estimate with k = 1.4.
  const cv0 = R / 0.4, cp0 = 1.4 * cv0;
  return {
    kind: "variable",
    R,
    cpAt, cvAt, kAt, u, h, sT,
    TfromU: (target) => solveIncreasing(u, cvAt, target, target / cv0),
    TfromH: (target) => solveIncreasing(h, cpAt, target, target / cp0),
    // vRatio = vb / va: ψ(Tb) = ψ(Ta) − R ln(vRatio)
    isentropicT: (Ta, vRatio) => {
      const target = psi(Ta) - R * Math.log(vRatio);
      return solveIncreasing(psi, (T) => cvAt(T) / T, target, Ta * vRatio ** -0.4);
    },
  };
}

// One shared air object (it holds no state). `specificHeats` is "constant" or "variable"
// (state.specificHeats); k is only used by the constant gas.
const AIR = makeAir();
export function gasFor(specificHeats, k) {
  return specificHeats === "variable" ? AIR : makeGas({ k });
}
