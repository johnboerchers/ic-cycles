// The \val{…} map for the equations and prose in content/content.js: every name listed in the
// header of that file, formatted for TeX with formatTex (PHYSICS.md section 11), so inputs read
// as typed: (300)(8)^{0.4}, not (300.0)(8)^{0.4}.

import { formatTex } from "./format.js";

// Which format each name uses (the names are listed in the header of content.js).
const QUANTITY = {
  T1: "T", T2: "T", Tx: "T", T3: "T", T4: "T",
  P1: "P", P2: "P", Px: "P", P3: "P", P4: "P",
  v1: "v", v2: "v", vx: "v", v3: "v", v4: "v",
  r: "ratio", rp: "ratio", rc: "ratio", rexp: "ratio",
  k: "k", km1: "k", R: "k", cv: "cv", cp: "cp",
  qin: "q", qout: "q", wnet: "w", eta: "eta", mep: "mep",
  w12: "w", w34: "w", qV: "q", qP: "q", wP: "w", wstroke: "w",
};

export const VALUE_NAMES = Object.keys(QUANTITY);

// The raw numbers behind each name, from a solved cycle (core/cycle.js).
export function rawValues(solution) {
  const { states: s, gas, inputs, metrics: m, processes } = solution;
  const byRole = (role) => processes.find((p) => p.role === role);
  const heatV = byRole("heatAdditionV");
  const heatP = byRole("heatAdditionP");
  const out = {
    r: inputs.r, rp: inputs.rp, rc: inputs.rc, rexp: inputs.r / inputs.rc,
    k: gas.k, km1: gas.k - 1, R: gas.R, cv: gas.cv, cp: gas.cp,
    qin: m.qin, qout: m.qout, wnet: m.wnet, eta: m.eta, mep: m.mep,
    // Work and heat as magnitudes (in/out is in the symbol, Çengel & Boles).
    w12: Math.abs(byRole("compression").w),
    w34: Math.abs(byRole("expansion").w),
    qV: heatV ? heatV.q : 0,
    qP: heatP ? heatP.q : 0,
    wP: heatP ? heatP.w : 0,
    wstroke: s["1"].P * (s["1"].v - s["2"].v),
  };
  for (const id of ["1", "2", "x", "3", "4"]) {
    out[`T${id}`] = s[id].T;
    out[`P${id}`] = s[id].P;
    out[`v${id}`] = s[id].v;
  }
  return out;
}

// name -> TeX string, ready to replace \val{name}.
export function texValues(solution) {
  const raw = rawValues(solution);
  return Object.fromEntries(VALUE_NAMES.map((name) => [name, formatTex(QUANTITY[name], raw[name])]));
}

// Replaces every \val{name} in `tex` by its value. An unknown name is a mistake in content.js.
export function fillValues(tex, values) {
  return tex.replace(/\\val\{([^}]*)\}/g, (_, name) => {
    if (!(name in values)) throw new Error(`unknown value \\val{${name}}`);
    return values[name];
  });
}
