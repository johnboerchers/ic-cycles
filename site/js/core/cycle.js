// The Otto, Diesel and dual cycles as one family with states 1, 2, x, 3, 4
// (PHYSICS.md sections 2 and 3).

const EPS = 1e-9;

const p = (id, kind, role, from, to) => ({ id, kind, role, from, to });

export const PROCESS_TABLE = {
  otto: [
    p("1-2", "isentropic", "compression", "1", "2"),
    p("2-3", "constV", "heatAdditionV", "2", "3"),
    p("3-4", "isentropic", "expansion", "3", "4"),
    p("4-1", "constV", "heatRejection", "4", "1"),
  ],
  diesel: [
    p("1-2", "isentropic", "compression", "1", "2"),
    p("2-3", "constP", "heatAdditionP", "2", "3"),
    p("3-4", "isentropic", "expansion", "3", "4"),
    p("4-1", "constV", "heatRejection", "4", "1"),
  ],
  dual: [
    p("1-2", "isentropic", "compression", "1", "2"),
    p("2-x", "constV", "heatAdditionV", "2", "x"),
    p("x-3", "constP", "heatAdditionP", "x", "3"),
    p("3-4", "isentropic", "expansion", "3", "4"),
    p("4-1", "constV", "heatRejection", "4", "1"),
  ],
};

// Native inputs of each cycle type -> the ratios {r, rp, rc}.
export function ratiosFor(type, params, T1, gas) {
  const { r } = params;
  if (type === "otto") {
    const T2 = T1 * r ** (gas.k - 1);
    return { r, rp: 1 + params.qin / (gas.cv * T2), rc: 1 };
  }
  if (type === "diesel") return { r, rp: 1, rc: params.rc };
  return { r, rp: params.rp, rc: params.rc };
}

// Ratios for heat input qin, a fraction xv of it added at constant volume.
export function ratiosFromHeat({ r, qin, xv }, T1, gas) {
  const T2 = T1 * r ** (gas.k - 1);
  const rp = 1 + (xv * qin) / (gas.cv * T2);
  const rc = 1 + ((1 - xv) * qin) / (gas.cp * rp * T2);
  return { r, rp, rc };
}

// Closed-form thermal efficiency. With rp = rc = 1 the fraction is 0/0; the limit is Otto.
export function etaClosedForm({ r, rp, rc, k }) {
  const den = rp - 1 + k * rp * (rc - 1);
  if (den === 0) return 1 - r ** (1 - k);
  return 1 - (r ** (1 - k) * (rp * rc ** k - 1)) / den;
}

// Signed process energies: q > 0 heat to the gas, w > 0 work by the gas, q - w = du.
function processEnergy(kind, A, B, gas) {
  const du = gas.cv * (B.T - A.T);
  if (kind === "isentropic") return { q: 0, w: gas.cv * (A.T - B.T), du };
  if (kind === "constV") return { q: du, w: 0, du };
  return { q: gas.cp * (B.T - A.T), w: A.P * (B.v - A.v), du };
}

export function solveCycle({ type, P1, T1, r, rp, rc, gas }) {
  const { k, R, cv, cp } = gas;
  const v1 = (R * T1) / P1;
  const v2 = v1 / r;
  const T2 = T1 * r ** (k - 1);
  const P2 = P1 * r ** k;
  const Tx = rp * T2, Px = rp * P2, vx = v2;
  const T3 = rc * Tx, P3 = Px, v3 = rc * vx;
  const T4 = T3 * (v3 / v1) ** (k - 1), P4 = P3 * (v3 / v1) ** k, v4 = v1;
  const sx = cv * Math.log(Tx / T2);
  const s3 = sx + cp * Math.log(T3 / Tx);
  const states = {
    1: { P: P1, T: T1, v: v1, s: 0 },
    2: { P: P2, T: T2, v: v2, s: 0 },
    x: { P: Px, T: Tx, v: vx, s: sx },
    3: { P: P3, T: T3, v: v3, s: s3 },
    4: { P: P4, T: T4, v: v4, s: s3 },
  };

  const processes = PROCESS_TABLE[type].map(({ id, kind, role, from, to }) => {
    const A = states[from], B = states[to];
    // A heat addition of zero length (dual cycle with rp = 1 or rc = 1).
    const degenerate = role.startsWith("heatAddition") && Math.abs(B.T - A.T) <= EPS * A.T;
    return { id, kind, role, from, to, ...processEnergy(kind, A, B, gas), degenerate };
  });

  let qin = 0, qout = 0, wnet = 0, win = 0, wout = 0;
  for (const pr of processes) {
    if (pr.q > 0) qin += pr.q;
    else if (pr.q < 0) qout -= pr.q;
    if (pr.w > 0) wout += pr.w;
    else if (pr.w < 0) win -= pr.w;
    wnet += pr.w;
  }
  // No heat added at all (rp = rc = 1): efficiency does not exist, the UI shows "—".
  const heatAdded = processes.some((pr) => pr.role.startsWith("heatAddition") && !pr.degenerate);

  return {
    type,
    gas,
    inputs: { P1, T1, r, rp, rc },
    states,
    processes,
    metrics: {
      qin, qout, wnet, win, wout,
      eta: heatAdded ? wnet / qin : NaN,
      mep: wnet / (v1 - v2),
      Tmax: T3,
      Pmax: P3,
      etaCarnot: 1 - T1 / T3,
    },
  };
}
