// Shared test helpers: the reference fixture and tolerant numeric comparison.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { makeGas } from "../site/js/core/gas.js";
import { ratiosFor, solveCycle } from "../site/js/core/cycle.js";

export const TOL = 1e-9; // PHYSICS.md section 10

export const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/reference-cycles.json", import.meta.url), "utf8"),
);

// Relative tolerance 1e-9; absolute 1e-9 where the expected value is 0.
export function assertClose(actual, expected, label, tol = TOL) {
  assert.equal(typeof actual, "number", `${label}: expected a number, got ${actual}`);
  const err = Math.abs(actual - expected);
  const ok = expected === 0 ? err <= tol : err <= tol * Math.abs(expected);
  assert.ok(ok, `${label}: ${actual} differs from ${expected} (error ${err})`);
}

// Walks `expected` and compares every leaf: numbers with assertClose, everything else
// strictly. Keys must match exactly unless allowExtra lets `actual` carry more.
export function assertDeepClose(actual, expected, label, { allowExtra = false } = {}) {
  if (typeof expected === "number") return assertClose(actual, expected, label);
  if (expected === null || typeof expected !== "object") {
    return assert.equal(actual, expected, label);
  }
  assert.ok(actual !== null && typeof actual === "object", `${label}: not an object`);
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${label}: not an array`);
    assert.equal(actual.length, expected.length, `${label}: length`);
  } else if (!allowExtra) {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${label}: keys`);
  }
  for (const key of Object.keys(expected)) {
    assert.ok(key in actual, `${label}: missing ${key}`);
    assertDeepClose(actual[key], expected[key], `${label}.${key}`, { allowExtra });
  }
}

// Small seeded generator so the random tests are repeatable.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Solves one fixture cycle case from its native inputs.

export function solveCase(c) {
  const { type, P1, T1, k, R, params } = c.spec;
  const gas = makeGas({ k, R });
  const ratios = ratiosFor(type, params, T1, gas);
  return { gas, ratios, solution: solveCycle({ type, P1, T1, ...ratios, gas }) };
}

export const solutionsByName = Object.fromEntries(
  fixture.cycles.map((c) => [c.name, solveCase(c).solution]),
);
