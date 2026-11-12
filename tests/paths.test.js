import test from "node:test";
import assert from "node:assert/strict";
import { pointOnProcess, energyAlong, sampleProcess } from "../site/js/core/paths.js";
import { fixture, assertClose, assertDeepClose, solutionsByName } from "./helpers.js";

test("every fixture midpoint: state and running energy", () => {
  for (const c of fixture.cycles) {
    const s = solutionsByName[c.name];
    assert.equal(c.midpoints.length, 3 * c.processes.length);
    for (const m of c.midpoints) {
      const label = `${c.name} ${m.process} λ=${m.lambda}`;
      const pt = pointOnProcess(s, m.process, m.lambda);
      assertDeepClose(pt, { P: m.P, T: m.T, v: m.v, s: m.s }, label);
      assertDeepClose(energyAlong(s, m.process, pt), m.energy, `${label} energy`);
    }
  }
});

test("required 2: ideal gas law at every fixture midpoint", () => {
  for (const c of fixture.cycles) {
    const s = solutionsByName[c.name];
    for (const m of c.midpoints) {
      const { P, v, T } = pointOnProcess(s, m.process, m.lambda);
      assertClose(P * v, s.gas.R * T, `${c.name} ${m.process} λ=${m.lambda}`);
    }
  }
});

test("λ = 0 and λ = 1 are the end states; full-process energy is the process total", () => {
  for (const c of fixture.cycles) {
    const s = solutionsByName[c.name];
    for (const p of s.processes) {
      assertDeepClose(pointOnProcess(s, p.id, 0), s.states[p.from], `${c.name} ${p.id} start`);
      const end = pointOnProcess(s, p.id, 1);
      assertDeepClose(end, s.states[p.to], `${c.name} ${p.id} end`);
      const e = energyAlong(s, p.id, end);
      for (const key of ["q", "w", "du"]) {
        if (p[key] === 0) assert.ok(Math.abs(e[key]) <= 1e-9, `${c.name} ${p.id} ${key}`);
        else assertClose(e[key], p[key], `${c.name} ${p.id} ${key}`);
      }
    }
  }
});

test("sampleProcess: counts, endpoints, spacing", () => {
  const s = solutionsByName["dual-default"];
  for (const p of s.processes) {
    const pts = sampleProcess(s, p.id);
    const n = p.kind === "isentropic" ? 64 : 32;
    assert.equal(pts.length, n + 1, `${p.id} count`);
    assert.equal(pts[0].lambda, 0);
    assert.equal(pts[n].lambda, 1);
    assertDeepClose(pts[0], { ...s.states[p.from], lambda: 0 }, `${p.id} first`);
    assertDeepClose(pts[n], { ...s.states[p.to], lambda: 1 }, `${p.id} last`);
    for (let i = 1; i <= n; i++) assert.ok(pts[i].lambda > pts[i - 1].lambda, `${p.id} λ increases`);
    if (p.kind === "isentropic") {
      const ratio = pts[1].v / pts[0].v;
      for (let i = 1; i <= n; i++) assertClose(pts[i].v / pts[i - 1].v, ratio, `${p.id} geometric v at ${i}`);
    } else {
      for (let i = 0; i <= n; i++) assertClose(pts[i].lambda, i / n, `${p.id} uniform λ at ${i}`);
    }
    for (const pt of pts) assertClose(pt.P * pt.v, s.gas.R * pt.T, `${p.id} Pv = RT`);
  }
  assert.equal(sampleProcess(s, "1-2", 8).length, 9);
});

test("unknown process id throws", () => {
  assert.throws(() => pointOnProcess(solutionsByName["otto-default"], "2-x", 0.5));
});
