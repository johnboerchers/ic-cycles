// Points along a process and the running energy (PHYSICS.md section 4).
// lambda is linear in volume where the piston moves (isentropic, constP) and linear in
// temperature where it does not (constV).

function processById(solution, processId) {
  const pr = solution.processes.find((x) => x.id === processId);
  if (!pr) throw new Error(`no process ${processId} in a ${solution.type} cycle`);
  return pr;
}

export function pointOnProcess(solution, processId, lambda) {
  const { k, cv, cp } = solution.gas;
  const pr = processById(solution, processId);
  const A = solution.states[pr.from], B = solution.states[pr.to];
  if (pr.kind === "constV") {
    const T = A.T + lambda * (B.T - A.T);
    return { P: (A.P * T) / A.T, T, v: A.v, s: A.s + cv * Math.log(T / A.T) };
  }
  const v = A.v + lambda * (B.v - A.v);
  if (pr.kind === "constP") {
    const T = (A.T * v) / A.v;
    return { P: A.P, T, v, s: A.s + cp * Math.log(T / A.T) };
  }
  return { P: A.P * (A.v / v) ** k, T: A.T * (A.v / v) ** (k - 1), v, s: A.s };
}

// Running signed {q, w, du} from the start of the process to `state`.
export function energyAlong(solution, processId, state) {
  const { cv, cp } = solution.gas;
  const pr = processById(solution, processId);
  const A = solution.states[pr.from];
  const du = cv * (state.T - A.T);
  if (pr.kind === "isentropic") return { q: 0, w: -du, du };
  if (pr.kind === "constV") return { q: du, w: 0, du };
  return { q: cp * (state.T - A.T), w: A.P * (state.v - A.v), du };
}

// Points for drawing, each {P, T, v, s, lambda}, n + 1 of them from state a to state b.
// Isentropes are spaced geometrically in v so the steep end near TDC stays smooth.
export function sampleProcess(solution, processId, n) {
  const pr = processById(solution, processId);
  const isentropic = pr.kind === "isentropic";
  const count = n ?? (isentropic ? 64 : 32);
  const va = solution.states[pr.from].v, vb = solution.states[pr.to].v;
  const points = [];
  for (let i = 0; i <= count; i++) {
    let lambda = i / count;
    if (isentropic && i > 0 && i < count) {
      const v = va * (vb / va) ** (i / count);
      lambda = (v - va) / (vb - va);
    }
    points.push({ ...pointOnProcess(solution, processId, lambda), lambda });
  }
  return points;
}
