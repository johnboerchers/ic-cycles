import test from "node:test";
import assert from "node:assert/strict";
import { makeGas, R_AIR } from "../site/js/core/gas.js";
import { fixture, assertDeepClose, assertClose } from "./helpers.js";

test("gas of every fixture cycle", () => {
  for (const c of fixture.cycles) {
    assertDeepClose(makeGas({ k: c.spec.k, R: c.spec.R }), c.gas, `${c.name} gas`);
  }
});

test("defaults are air at k = 1.4, and cp − cv = R, cp/cv = k", () => {
  const g = makeGas();
  assert.equal(g.R, R_AIR);
  assert.equal(g.k, 1.4);
  assertClose(g.cv, 0.7175, "cv");
  assertClose(g.cp, 1.0045, "cp");
  for (const k of [1.3, 1.4, 5 / 3]) {
    const h = makeGas({ k });
    assertClose(h.cp - h.cv, R_AIR, `cp - cv at k=${k}`);
    assertClose(h.cp / h.cv, k, `cp/cv at k=${k}`);
  }
});
