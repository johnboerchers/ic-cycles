// Tests for the M4 core helpers: the \val{…} map and the steps of the process card.
import test from "node:test";
import assert from "node:assert/strict";
import { texValues, rawValues, fillValues, VALUE_NAMES } from "../site/js/core/values.js";
import { cardSteps, playheadCard, validCard, processStart, cardPhase } from "../site/js/core/steps.js";
import { buildModel, solveCycleFor, framesAt, timelineSegments } from "../site/js/core/model.js";
import { defaultState } from "../site/js/state/defaults.js";
import { CONTENT } from "../site/js/content/content.js";
import { assertClose } from "./helpers.js";

const stateFor = (cycle, params = {}, shared = {}) => {
  const d = defaultState();
  return {
    ...d,
    cycle,
    params: { ...d.params, [cycle]: { ...d.params[cycle], ...params } },
    shared: { ...d.shared, ...shared },
  };
};
const solutionFor = (cycle, params, shared) => {
  const st = stateFor(cycle, params, shared);
  return solveCycleFor(cycle, st.params[cycle], st.shared);
};

// ------------------------------------------------------------------ values

test("values: every name in the header of content.js has a value", () => {
  const header = (
    "T1 T2 Tx T3 T4 P1 P2 Px P3 P4 v1 v2 vx v3 v4 r rp rc rexp " +
    "k km1 R cv cp qin qout wnet eta mep w12 w34 qV qP wP wstroke"
  ).split(" ");
  assert.deepEqual([...VALUE_NAMES].sort(), header.sort());
  for (const cycle of ["otto", "diesel", "dual"]) {
    const v = texValues(solutionFor(cycle));
    for (const name of header) assert.equal(typeof v[name], "string", `${cycle} ${name}`);
  }
});

test("values: default Otto, typed-in values trimmed, computed values in full format", () => {
  const v = texValues(solutionFor("otto"));
  assert.equal(v.T1, "300");
  assert.equal(v.P1, "100");
  assert.equal(v.r, "8");
  assert.equal(v.k, "1.4");
  assert.equal(v.km1, "0.4");
  assert.equal(v.R, "0.287");
  assert.equal(v.cv, "0.7175");
  assert.equal(v.cp, "1.0045");
  assert.equal(v.qin, "800");
  assert.equal(v.T2, "689.2");
  assert.equal(v.P2, "1838");
  assert.equal(v.T3, "1804.2");
  assert.equal(v.P3, "4811");
  assert.equal(v.v1, "0.8610");
  assert.equal(v.eta, "56.5\\%");
  assert.equal(v.w12, "279.3");
  assert.equal(v.w34, "731.0");
  assert.equal(v.qout, "348.2");
  assert.equal(v.wnet, "451.8");
  assert.equal(v.wstroke, "75.3");
});

test("values: the Otto 1-2 card reads T2 = (300)(8)^{0.4} = 689.2 K", () => {
  const num = CONTENT.cycles.otto.processes["1-2"].equations[0].num;
  assert.equal(fillValues(num, texValues(solutionFor("otto"))), String.raw`T_2 = (300)(8)^{0.4} = 689.2\ \text{K}`);
});

test("values: Diesel work during heat addition and dual heat split", () => {
  const d = texValues(solutionFor("diesel"));
  assert.equal(d.wP, "273.6");
  assert.equal(d.qin, "957.6");
  assert.equal(d.qV, "0.0");
  assert.equal(d.rexp, "9");
  assert.equal(d.rc, "2");
  assert.equal(texValues(solutionFor("dual")).eta, "65.0\\%");
  assert.equal(texValues(solutionFor("dual", { rp: 1.5 })).rp, "1.5");
  const dualRaw = rawValues(solutionFor("dual"));
  assertClose(dualRaw.qV + dualRaw.qP, dualRaw.qin, "dual qV + qP = qin");
  assertClose(dualRaw.w12, -solutionFor("dual").processes[0].w, "w12 is a magnitude");
});

test("values: a cycle that adds no heat shows eta as a TeX-safe dash", () => {
  const v = texValues(solutionFor("dual", { rp: 1, rc: 1 }));
  assert.equal(v.eta, "\\text{—}");
  assert.equal(v.qin, "0.0");
});

test("values: qin is trimmed only where the user typed it (Otto)", () => {
  assert.equal(texValues(solutionFor("otto", { qin: 1200 })).qin, "1200");
  assert.equal(texValues(solutionFor("otto", {}, { T1: 290, P1: 95 })).T1, "290");
  assert.equal(texValues(solutionFor("otto", {}, { T1: 290, P1: 95 })).P1, "95");
});

test("fillValues: replaces every \\val and rejects unknown names", () => {
  assert.equal(fillValues(String.raw`(\val{a})^{\val{b}} = \val{a}`, { a: "8", b: "0.4" }), "(8)^{0.4} = 8");
  assert.throws(() => fillValues(String.raw`\val{nope}`, {}), /nope/);
});

// ------------------------------------------------------------------ card steps

test("steps: intro, each drawn process, summary", () => {
  assert.deepEqual(cardSteps(buildModel(stateFor("otto"))), ["intro", "1-2", "2-3", "3-4", "4-1", "summary"]);
  assert.deepEqual(cardSteps(buildModel(stateFor("dual"))), ["intro", "1-2", "2-x", "x-3", "3-4", "4-1", "summary"]);
  // r_c = 1: the dual cycle has no x-3 step.
  assert.deepEqual(cardSteps(buildModel(stateFor("dual", { rc: 1 }))), ["intro", "1-2", "2-x", "3-4", "4-1", "summary"]);
  // With the strokes on, the stroke cards follow 4-1.
  const strokes = { ...stateFor("otto"), options: { ...defaultState().options, strokes: true } };
  assert.deepEqual(cardSteps(buildModel(strokes)), ["intro", "1-2", "2-3", "3-4", "4-1", "1-0", "0-1", "summary"]);
});

test("steps: the card follows the playhead inside a process and stays at a state", () => {
  const model = buildModel(stateFor("diesel"));
  for (const seg of timelineSegments(model)) {
    const mid = framesAt(model, (seg.u0 + seg.u1) / 2)[0];
    assert.equal(playheadCard(mid, "intro"), seg.processId);
    // At the end of the process (the state), the current card stays.
    const end = framesAt(model, cardPhase(model, seg.processId))[0];
    assert.equal(playheadCard(end, seg.processId), seg.processId, `end of ${seg.processId}`);
  }
  assert.equal(playheadCard(framesAt(model, 0)[0], "intro"), "intro");
});

test("steps: cardPhase is the end of the process (start of the next), processStart its start", () => {
  const model = buildModel(stateFor("otto"));
  const segs = timelineSegments(model);
  assert.equal(cardPhase(model, "intro"), 0);
  assert.equal(cardPhase(model, "summary"), 0);
  assert.equal(cardPhase(model, "1-2"), segs[1].u0);
  assert.equal(cardPhase(model, "4-1"), 0);
  assert.equal(processStart(model, "2-3"), segs[1].u0);
});

test("steps: validCard keeps a card that exists and replaces one that disappeared", () => {
  const dual = buildModel(stateFor("dual"));
  const frame = framesAt(dual, 0)[0];
  assert.equal(validCard(dual, "x-3", frame), "x-3");
  const noX3 = buildModel(stateFor("dual", { rc: 1 }));
  const seg = timelineSegments(noX3).find((s) => s.processId === "3-4");
  const inside = framesAt(noX3, (seg.u0 + seg.u1) / 2)[0];
  assert.equal(validCard(noX3, "x-3", inside), "3-4");
  assert.equal(validCard(noX3, "x-3", framesAt(noX3, 0)[0]), "intro");
  // Paused at state 3 (the start of 3-4): the process that ends there, 2-x.
  assert.equal(validCard(noX3, "x-3", framesAt(noX3, seg.u0)[0]), "2-x");
});
