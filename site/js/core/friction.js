// Friction on top of the ideal cycle (PHYSICS.md section 13): the indicated quantities of a
// solved cycle become brake quantities for an engine of a given size and speed. It changes
// nothing in the cycle itself. A four-stroke engine: two revolutions per cycle.

export const REV_PER_CYCLE = 2;

// engine = { fmep (kPa), Vd (L), N (rev/min) }. Since kPa·L = J, every work per cycle is in J.
// Returns exactly the keys of the fixture's `results`.
export function frictionResults(solution, engine) {
  const { fmep, Vd, N } = engine;
  const { metrics: m, states } = solution;
  const imep = m.mep;
  const dv = states["1"].v - states["2"].v; // swept volume per kg, m³/kg
  const bmep = imep - fmep;
  // With no heat added imep is 0 and there is no ratio to take.
  const etam = imep > 0 ? bmep / imep : NaN;
  const wf = fmep * dv; // kJ/kg
  const mdot = (Vd / 1000 / dv) * (N / (60 * REV_PER_CYCLE)); // kg/s
  const power = (mep) => (mep * Vd * N) / (60 * REV_PER_CYCLE * 1000); // kW
  const torque = (mep) => (mep * Vd) / (2 * Math.PI * REV_PER_CYCLE); // N·m
  return {
    imep,
    fmep,
    bmep,
    canRun: bmep > 0,
    etam,
    etab: m.eta * etam,
    wf,
    wb: m.wnet - wf,
    mdot,
    Qin: mdot * m.qin,
    Wi: power(imep),
    Wf: power(fmep),
    Wb: power(bmep),
    taui: torque(imep),
    taub: torque(bmep),
  };
}
