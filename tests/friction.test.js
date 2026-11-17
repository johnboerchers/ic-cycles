// Milestone M10: friction on top of the cycle (PHYSICS.md section 13), checked against
// tests/fixtures/reference-friction.json, which the independent Python reference wrote.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { frictionResults, REV_PER_CYCLE } from "../site/js/core/friction.js";
import { buildModel, solveCycleFor, framesAt } from "../site/js/core/model.js";
import { cardSteps, validCard, cardPhase } from "../site/js/core/steps.js";
import { contentFor, dialogContent } from "../site/js/core/content.js";
import { texValues, fillValues, FRICTION_VALUE_NAMES, VALUE_NAMES } from "../site/js/core/values.js";
import { defaultState, ENGINE } from "../site/js/state/defaults.js";
import { CONTENT, FRICTION } from "../site/js/content/content.js";
import { assertClose, assertDeepClose } from "./helpers.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/reference-friction.json", import.meta.url), "utf8"));

function solve(c) {
  const shared = { T1: c.T1, P1: c.P1, k: c.k ?? 1.4 };
  return solveCycleFor(c.type, c.params, shared, c.gas);
}

test("friction fixture: four-stroke, eight cases", () => {
  assert.equal(fx.revolutionsPerCycle, REV_PER_CYCLE);
  assert.equal(fx.cases.length, 8);
});

for (const c of fx.cases) {
  test(`friction: ${c.name} reproduces the reference at 1e-9`, () => {
    const sol = solve(c);
    // the cycle numbers the friction layer builds on
    assertClose(sol.metrics.mep, c.cycle.mep, "mep");
    assertClose(sol.metrics.wnet, c.cycle.wnet, "wnet");
    assertClose(sol.metrics.qin, c.cycle.qin, "qin");
    assertClose(sol.metrics.eta, c.cycle.eta, "eta");
    const res = frictionResults(sol, c.engine);
    assert.deepEqual(Object.keys(res).sort(), Object.keys(c.results).sort());
    assert.equal(res.canRun, c.results.canRun);
    const { canRun, ...numbers } = c.results;
    assertDeepClose(res, { canRun, ...numbers }, c.name);
  });
}

test("friction: the headline numbers of the default Otto cycle", () => {
  const res = frictionResults(solveCycleFor("otto", { r: 8, qin: 800 }, { T1: 300, P1: 100, k: 1.4 }), { fmep: 150, Vd: 2, N: 3000 });
  assert.equal(res.bmep.toFixed(1), "449.7");
  assert.equal((100 * res.etam).toFixed(1), "75.0");
  assert.equal((100 * res.etab).toFixed(1), "42.3");
  assert.equal(res.Wb.toFixed(1), "22.5");
  assert.equal(res.taub.toFixed(1), "71.6");
  assert.equal(res.Wf.toFixed(1), "7.5");
  assert.equal(res.Qin.toFixed(1), "53.1");
  assert.equal(res.wf.toFixed(1), "113.0");
  assert.equal(res.wb.toFixed(1), "338.8");
});

test("friction: engine speed scales power, displacement scales power and torque, efficiencies stay", () => {
  const sol = solveCycleFor("otto", { r: 8, qin: 800 }, { T1: 300, P1: 100, k: 1.4 });
  const a = frictionResults(sol, { fmep: 150, Vd: 2, N: 3000 });
  const fast = frictionResults(sol, { fmep: 150, Vd: 2, N: 6000 });
  assertClose(fast.Wb, 2 * a.Wb, "double speed doubles power");
  assertClose(fast.taub, a.taub, "torque does not depend on speed");
  const small = frictionResults(sol, { fmep: 150, Vd: 1, N: 3000 });
  assertClose(small.Wb, a.Wb / 2, "half displacement halves power");
  assertClose(small.taub, a.taub / 2, "half displacement halves torque");
  assertClose(small.etab, a.etab, "efficiency does not depend on size");
});

test("friction: fmep = 0 gives brake = indicated, and the first law closes", () => {
  const sol = solveCycleFor("dual", { r: 16, rp: 1.5, rc: 1.5 }, { T1: 300, P1: 100, k: 1.4 });
  const res = frictionResults(sol, { fmep: 0, Vd: 2, N: 3000 });
  assertClose(res.etab, sol.metrics.eta, "etab = eta");
  assert.equal(res.etam, 1);
  assertClose(res.Wb, res.Wi, "Wb = Wi");
  // w_b + w_f = w_net, and Wb / Qin = eta_b
  const rub = frictionResults(sol, { fmep: 100, Vd: 2, N: 3000 });
  assertClose(rub.wb + rub.wf, sol.metrics.wnet, "wb + wf = wnet");
  assertClose(rub.Wb / rub.Qin, rub.etab, "Wb / Qin = etab");
});

test("friction: a cycle that adds no heat has no mechanical or brake efficiency", () => {
  const sol = solveCycleFor("dual", { r: 16, rp: 1, rc: 1 }, { T1: 300, P1: 100, k: 1.4 });
  const res = frictionResults(sol, { fmep: 150, Vd: 2, N: 3000 });
  assert.equal(res.canRun, false);
  assert.ok(Number.isNaN(res.etam));
  assert.ok(Number.isNaN(res.etab));
});

// ------------------------------------------------------------- state, model, steps, content, values

const withFriction = (patch = {}) => {
  const st = defaultState();
  st.options.friction = true;
  return { ...st, ...patch };
};

test("defaults: the engine ranges and values, friction off", () => {
  const st = defaultState();
  assert.deepEqual(st.engine, { fmep: 150, Vd: 2, N: 3000 });
  assert.equal(st.options.friction, false);
  assert.deepEqual(ENGINE.fmep, { min: 0, max: 400, step: 5, value: 150 });
  assert.deepEqual(ENGINE.Vd, { min: 0.5, max: 6, step: 0.1, value: 2 });
  assert.deepEqual(ENGINE.N, { min: 600, max: 7000, step: 100, value: 3000 });
});

test("model: friction is the engine while the option is on (explore only), otherwise null", () => {
  assert.equal(buildModel(defaultState()).friction, null);
  assert.deepEqual(buildModel(withFriction()).friction, { fmep: 150, Vd: 2, N: 3000 });
  assert.equal(buildModel(withFriction({ mode: "compare" })).friction, null);
  const st = withFriction();
  st.engine = { fmep: 200, Vd: 3, N: 4000 };
  assert.deepEqual(buildModel(st).friction, { fmep: 200, Vd: 3, N: 4000 });
});

test("steps: the friction card follows the summary only while friction is on", () => {
  assert.deepEqual(cardSteps(buildModel(defaultState())), ["intro", "1-2", "2-3", "3-4", "4-1", "summary"]);
  const on = buildModel(withFriction());
  assert.deepEqual(cardSteps(on), ["intro", "1-2", "2-3", "3-4", "4-1", "summary", "friction"]);
  assert.equal(cardPhase(on, "friction"), 0);
  // switched off while the friction card shows: back to the summary
  const off = buildModel(defaultState());
  assert.equal(validCard(off, "friction", framesAt(off, 0)[0]), "summary");
  assert.equal(validCard(on, "friction", framesAt(on, 0)[0]), "friction");
});

test("dialogContent: friction's Model point and symbols are appended only while friction is on", () => {
  const c = contentFor("constant");
  const off = dialogContent(c, false);
  assert.equal(off.points, c.model.points);
  assert.equal(off.symbols, c.symbols);
  const on = dialogContent(c, true);
  assert.deepEqual(on.points, [...CONTENT.model.points, FRICTION.modelPoint]);
  assert.deepEqual(on.symbols, [...CONTENT.symbols, ...FRICTION.symbols]);
  const v = dialogContent(contentFor("variable"), true);
  assert.equal(v.points.at(-1), FRICTION.modelPoint);
  assert.ok(v.symbols.length > on.symbols.length);
});

test("texValues: the friction names, from the default engine or the one given", () => {
  const sol = solveCycleFor("otto", { r: 8, qin: 800 }, { T1: 300, P1: 100, k: 1.4 });
  assert.deepEqual(FRICTION_VALUE_NAMES.sort(), "imep fmep bmep etam etab Vd N Wb taub".split(" ").sort());
  assert.ok(!VALUE_NAMES.includes("imep")); // the extra names are not in the earlier list
  const v = texValues(sol);
  assert.equal(v.imep, "599.7");
  assert.equal(v.fmep, "150"); // typed in: trimmed
  assert.equal(v.bmep, "449.7");
  assert.equal(v.etam, "75.0\\%");
  assert.equal(v.etab, "42.3\\%");
  assert.equal(v.Vd, "2");
  assert.equal(v.N, "3000");
  assert.equal(v.Wb, "22.5");
  assert.equal(v.taub, "71.6");
  const w = texValues(sol, undefined, { fmep: 120, Vd: 1.6, N: 5000 });
  assert.equal(w.fmep, "120");
  assert.equal(w.Vd, "1.6");
  assert.equal(w.N, "5000");
  assert.equal(
    fillValues(FRICTION.card.equations[0].num, v),
    String.raw`\text{bmep} = 599.7 - 150 = 449.7\ \text{kPa}`,
  );
  // an engine that cannot run: no efficiencies
  const idle = texValues(solveCycleFor("otto", { r: 8, qin: 200 }, { T1: 300, P1: 100, k: 1.4 }));
  assert.equal(idle.etam, "\\text{—}");
  assert.equal(idle.etab, "\\text{—}");
});
