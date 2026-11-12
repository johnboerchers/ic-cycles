// Every piece of math in content.js must typeset with the vendored KaTeX: each `tex`, each
// `num` after \val substitution for the three default cycles, each role `curve`, and each
// inline $…$ in the prose. strict: "error" also turns KaTeX's console warnings into failures.
import test from "node:test";
import assert from "node:assert/strict";
import katex from "../site/vendor/katex/katex.mjs";
import { CONTENT } from "../site/js/content/content.js";
import { texValues, fillValues } from "../site/js/core/values.js";
import { solveCycleFor } from "../site/js/core/model.js";
import { defaultState } from "../site/js/state/defaults.js";

const OPTIONS = { throwOnError: true, strict: "error" };

const d = defaultState();
const VALUES = Object.fromEntries(
  ["otto", "diesel", "dual"].map((c) => [c, texValues(solveCycleFor(c, d.params[c], d.shared))]),
);

// Every string in the content tree with its path, such as "cycles.otto.processes.1-2.equations.0.num".
function* walk(node, path = []) {
  if (typeof node === "string") yield { path: path.join("."), key: path[path.length - 1], s: node };
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) yield* walk(v, [...path, k]);
  }
}

function render(tex, where, display) {
  try {
    katex.renderToString(tex, { ...OPTIONS, displayMode: display });
  } catch (e) {
    assert.fail(`${where}: ${e.message}\n  ${tex}`);
  }
}

const inlineMath = (s) => [...s.matchAll(/\$([^$]*)\$/g)].map((m) => m[1]);

const all = [...walk(CONTENT)];

test("katex: the vendored module loads", () => {
  assert.match(katex.version, /^0\.16\./);
});

test("katex: every symbolic equation (tex) and role curve renders", () => {
  const items = all.filter((x) => x.key === "tex" || x.key === "curve");
  assert.ok(items.length > 40, `only ${items.length} tex strings found`);
  for (const { path, s } of items) render(s, path, true);
});

test("katex: every numeric equation (num) renders for the three default cycles", () => {
  const items = all.filter((x) => x.key === "num");
  assert.ok(items.length > 30, `only ${items.length} num strings found`);
  for (const { path, s } of items) {
    for (const [cycle, values] of Object.entries(VALUES)) render(fillValues(s, values), `${path} (${cycle})`, true);
  }
});

test("katex: every inline $…$ in the prose renders for the three default cycles", () => {
  let count = 0;
  for (const { path, key, s } of all) {
    if (key === "tex" || key === "num" || key === "curve") continue;
    assert.equal((s.match(/\$/g) || []).length % 2, 0, `${path}: unbalanced $`);
    for (const m of inlineMath(s)) {
      count++;
      for (const [cycle, values] of Object.entries(VALUES)) render(fillValues(m, values), `${path} (${cycle})`, false);
    }
  }
  assert.ok(count > 20, `only ${count} inline math pieces found`);
});
