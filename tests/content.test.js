// Guards the teaching content in site/js/content/content.js against broken edits:
// every \val{name} must be a known value, every cycle must describe exactly its own
// processes, and every equation must have both a symbolic and a numeric form.
import test from "node:test";
import assert from "node:assert/strict";
import { CONTENT } from "../site/js/content/content.js";

const VALUE_NAMES = new Set((
  "T1 T2 Tx T3 T4 P1 P2 Px P3 P4 v1 v2 vx v3 v4 r rp rc rexp " +
  "k km1 R cv cp qin qout wnet eta mep w12 w34 qV qP wP wstroke"
).split(" "));

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

test("equations have a symbolic and a numeric form", () => {
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
  visit(CONTENT, "CONTENT");
});

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
