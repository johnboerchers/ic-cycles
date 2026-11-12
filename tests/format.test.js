import test from "node:test";
import assert from "node:assert/strict";
import { formatValue, formatTex, MINUS, MISSING } from "../site/js/core/format.js";

test("examples from PHYSICS.md section 11", () => {
  const cases = [
    ["T", 689.2190129982209, "689.2"],
    ["P", 100, "100.0"],
    ["P", 4811.204243721156, "4811"],
    ["P", 1837.9173679952557, "1838"],
    ["P", 261.77478528150976, "261.8"],
    ["P", 999.97, "1000"],
    ["P", 12345.6, "12346"],
    ["v", 0.861, "0.8610"],
    ["v", 0.107625, "0.1076"],
    ["v", 0.99996, "1.000"],
    ["s", 0.6904605460851576, "0.6905"],
    ["q", 451.77977468155035, "451.8"],
    ["w", 279.26464182622357, "279.3"],
    ["u", 0, "0.0"],
    ["mep", 599.6744976692223, "599.7"],
    ["eta", 0.5647247183519378, "56.5 %"],
    ["ratio", 8, "8"],
    ["ratio", 2.6177478528150973, "2.618"],
    ["ratio", 2.5, "2.5"],
    ["k", 1.4, "1.4"],
    ["k", 5 / 3, "1.667"],
    ["cv", 0.7175000000000001, "0.7175"],
    ["cp", 1.0045000000000002, "1.0045"],
  ];
  for (const [q, x, want] of cases) assert.equal(formatValue(q, x), want, `${q} ${x}`);
});

test("true minus sign, no negative zero, dash for missing values", () => {
  assert.equal(formatValue("w", -279.26), `${MINUS}279.3`);
  assert.equal(formatValue("s", -0.00001), "0.0000");
  assert.equal(formatValue("q", -0.01), "0.0");
  assert.equal(formatValue("q", -0), "0.0");
  for (const x of [NaN, Infinity, null, undefined]) assert.equal(formatValue("eta", x), MISSING);
  assert.throws(() => formatValue("speed", 1));
});

test("TeX values read as typed", () => {
  assert.equal(formatTex("T", 300), "300");
  assert.equal(formatTex("T", 689.2190129982209), "689.2");
  assert.equal(formatTex("ratio", 8), "8");
  assert.equal(formatTex("k", 0.4), "0.4");
  assert.equal(formatTex("P", 100), "100");
  assert.equal(formatTex("P", 4811.2), "4811");
  assert.equal(formatTex("P", 1000), "1000");
  assert.equal(formatTex("v", 0.861), "0.861");
  assert.equal(formatTex("cv", 0.7175000000000001), "0.7175");
  assert.equal(formatTex("q", 800.0000000000002), "800");
  assert.equal(formatTex("eta", 0.5647247183519378), "56.5\\%");
  assert.equal(formatTex("eta", 0.5), "50\\%");
  assert.equal(formatTex("w", -12.25), "-12.3");
  assert.equal(formatTex("eta", NaN), "\\text{—}");
});
