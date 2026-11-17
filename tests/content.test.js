// Guards the teaching content in site/js/content/content.js against broken edits:
// every \val{name} must be a known value, every cycle must describe exactly its own
// processes, and every equation must have both a symbolic and a numeric form.
import test from "node:test";
import assert from "node:assert/strict";
import { CONTENT, VARIABLE, FRICTION } from "../site/js/content/content.js";

const VALUE_NAMES = new Set((
  "T1 T2 Tx T3 T4 P1 P2 Px P3 P4 v1 v2 vx v3 v4 r rp rc rexp " +
  "k km1 R cv cp qin qout wnet eta mep w12 w34 qV qP wP wstroke"
).split(" "));

// Extra names that exist only with variable specific heats (VARIABLE in content.js).
const VARIABLE_NAMES = new Set([...VALUE_NAMES, ..."u1 u2 ux u3 u4 h2 hx h3 etaCold".split(" ")]);

// Extra names that exist only when friction is on (FRICTION in content.js).
const FRICTION_NAMES = new Set([...VALUE_NAMES, ..."imep fmep bmep etam etab Vd N Wb taub".split(" ")]);

const PROCESS_IDS = {
  otto: ["1-2", "2-3", "3-4", "4-1"],
  diesel: ["1-2", "2-3", "3-4", "4-1"],
  dual: ["1-2", "2-x", "x-3", "3-4", "4-1"],
};

const TRENDS = new Set(["up", "down", "const"]);

function strings(node, out = []) {
  if (typeof node === "string") out.push(node);
  else if (node && typeof node === "object") Object.values(node).forEach((v) => strings(v, out));
  return out;
}

function checkCard(card, where) {
  for (const key of ["title", "what", "engine", "energy", "notice"]) {
    assert.equal(typeof card[key], "string", `${where}: missing ${key}`);
  }
  assert.deepEqual(Object.keys(card.trends).sort(), ["P", "T", "s", "v"], `${where}: trends`);
  Object.values(card.trends).forEach((v) => assert.ok(TRENDS.has(v), `${where}: trend ${v}`));
  assert.ok(card.equations.length > 0, `${where}: no equations`);
}

test("every \\val{name} refers to a known value", () => {
  for (const s of strings(CONTENT)) {
    for (const [, name] of s.matchAll(/\\val\{(\w+)\}/g)) {
      assert.ok(VALUE_NAMES.has(name), `unknown \\val{${name}} in: ${s}`);
    }
  }
});

test("inline math delimiters are balanced", () => {
  for (const s of strings(CONTENT)) {
    const dollars = (s.match(/\$/g) || []).length;
    assert.equal(dollars % 2, 0, `odd number of $ in: ${s}`);
  }
});

function checkEquations(root, label) {
  const visit = (node, where) => {
    if (Array.isArray(node)) return node.forEach((n, i) => visit(n, `${where}[${i}]`));
    if (!node || typeof node !== "object") return;
    if ("tex" in node && "num" in node) {
      assert.ok(node.tex.length > 0 && node.num.length > 0, where);
      for (const part of [node.tex, node.num]) {
        const open = (part.match(/\{/g) || []).length;
        const close = (part.match(/\}/g) || []).length;
        assert.equal(open, close, `unbalanced braces at ${where}: ${part}`);
      }
      assert.ok(!/\\val\{/.test(node.tex), `symbolic form contains \\val at ${where}`);
    }
    for (const [k, v] of Object.entries(node)) visit(v, `${where}.${k}`);
  };
  visit(root, label);
}

test("equations have a symbolic and a numeric form", () => checkEquations(CONTENT, "CONTENT"));

for (const [type, ids] of Object.entries(PROCESS_IDS)) {
  test(`${type}: content covers exactly its processes`, () => {
    const cycle = CONTENT.cycles[type];
    assert.deepEqual(Object.keys(cycle.processes), ids);
    ids.forEach((id) => checkCard(cycle.processes[id], `${type} ${id}`));
    for (const key of ["name", "tagline", "headHardware"]) assert.equal(typeof cycle[key], "string");
    assert.ok(cycle.intro.equations.length > 0 && cycle.summary.equations.length > 0);
  });
}

test("stroke cards and compare texts exist", () => {
  checkCard(CONTENT.strokes["1-0"], "stroke 1-0");
  checkCard(CONTENT.strokes["0-1"], "stroke 0-1");
  for (const key of ["independent", "same-r-qin", "same-pmax-qin"]) {
    assert.equal(typeof CONTENT.compare[key].label, "string");
    assert.equal(typeof CONTENT.compare[key].takeaway, "string");
  }
});

// ------------------------------------------------- variable specific heats (VARIABLE)

const CARD_FIELDS = new Set(["title", "what", "engine", "energy", "notice", "trends", "equations", "text"]);

test("variable: every \\val{name} refers to a value that exists in that mode", () => {
  for (const s of strings(VARIABLE)) {
    for (const [, name] of s.matchAll(/\\val\{(\w+)\}/g)) {
      assert.ok(VARIABLE_NAMES.has(name), `unknown \\val{${name}} in: ${s}`);
    }
    assert.equal((s.match(/\$/g) || []).length % 2, 0, `odd number of $ in: ${s}`);
  }
});

test("variable: equations have a symbolic and a numeric form", () => checkEquations(VARIABLE, "VARIABLE"));

test("variable: overrides name existing cards and card fields", () => {
  for (const [type, cycle] of Object.entries(VARIABLE.cycles)) {
    assert.ok(type in CONTENT.cycles, `unknown cycle ${type}`);
    const cards = { intro: cycle.intro, summary: cycle.summary, ...(cycle.processes || {}) };
    for (const [id, card] of Object.entries(cards)) {
      if (!card) continue;
      if (id !== "intro" && id !== "summary") {
        assert.ok(PROCESS_IDS[type].includes(id), `${type}: no process ${id}`);
      }
      for (const field of Object.keys(card)) assert.ok(CARD_FIELDS.has(field), `${type} ${id}: unknown field ${field}`);
      for (const eq of card.equations || []) assert.ok(eq.tex && eq.num, `${type} ${id}: equation without tex or num`);
    }
  }
  assert.ok(VARIABLE.model.points.length > 0 && VARIABLE.model.caveats.length > 0);
  for (const sym of VARIABLE.symbols) {
    for (const key of ["tex", "name", "unit"]) assert.equal(typeof sym[key], "string");
  }
});

// ------------------------------------------------------- friction (FRICTION)

test("friction: every \\val{name} refers to a value that exists with friction on", () => {
  for (const s of strings(FRICTION)) {
    for (const [, name] of s.matchAll(/\\val\{(\w+)\}/g)) {
      assert.ok(FRICTION_NAMES.has(name), `unknown \\val{${name}} in: ${s}`);
    }
    assert.equal((s.match(/\$/g) || []).length % 2, 0, `odd number of $ in: ${s}`);
  }
});

test("friction: the card, model point and symbols are complete", () => {
  const c = FRICTION.card;
  for (const key of ["title", "what", "engine", "energy", "note", "notice"]) assert.equal(typeof c[key], "string", key);
  assert.ok(c.equations.length > 0);
  checkEquations(FRICTION, "FRICTION");
  assert.equal(typeof FRICTION.modelPoint, "string");
  for (const sym of FRICTION.symbols) {
    for (const key of ["tex", "name", "unit"]) assert.equal(typeof sym[key], "string");
  }
});
