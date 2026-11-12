import test from "node:test";
import assert from "node:assert/strict";
import { NICE_SERIES, niceUpper, niceBound, ticks, linear, colorRamp, segmentedScale } from "../site/js/core/scale.js";
import { assertClose } from "./helpers.js";

test("niceUpper: the next value of 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10 x 10^n", () => {
  const cases = [
    [5051.6, 6000], [6006, 8000], [7638.75, 8000], [0.904, 1], [0.1, 0.1], [0.101, 0.12],
    [1, 1], [1.0000001, 1.2], [9.5, 10], [10, 10], [12, 12], [13, 15], [2.6, 3], [3.5, 4],
    [4.2, 5], [5.5, 6], [7, 8], [0.0007, 0.0008], [123456, 150000], [0.3, 0.3], [0.31, 0.4],
  ];
  for (const [x, want] of cases) assert.equal(niceUpper(x), want, `niceUpper(${x})`);
});

test("niceUpper returns every series value unchanged, in every decade", () => {
  for (let n = -4; n <= 5; n++) {
    for (const s of NICE_SERIES) {
      const x = Number((s * 10 ** n).toPrecision(12));
      assert.equal(niceUpper(x), x, `niceUpper(${x})`);
    }
  }
  assert.throws(() => niceUpper(0));
  assert.throws(() => niceUpper(-1));
  assert.throws(() => niceUpper(NaN));
});

test("niceBound applies 1.05 headroom: the default cycles of BUILD_PLAN.md", () => {
  assert.equal(niceBound(4811.204243721156), 6000); // Otto P3
  assert.equal(niceBound(5720), 8000); // Diesel P3: 6006 is just above 6000
  assert.equal(niceBound(7275), 8000); // dual P3
  assert.equal(niceBound(0.861), 1); // v1 at 300 K and 100 kPa
  assert.equal(niceBound(5714.29), 8000); // 1.05 x 5714.29 = 6000.0045: just past the band
  assert.equal(niceBound(5714.28), 6000); // 1.05 x 5714.28 = 5999.994: still inside it
});

test("ticks: about five, evenly spaced, ending on the bound when they can", () => {
  const cases = [
    [0, 6000, [0, 1500, 3000, 4500, 6000]],
    [0, 8000, [0, 2000, 4000, 6000, 8000]],
    [0, 1, [0, 0.25, 0.5, 0.75, 1]],
    [0, 1.2, [0, 0.3, 0.6, 0.9, 1.2]],
    [0, 2500, [0, 500, 1000, 1500, 2000, 2500]],
    [0, 4000, [0, 1000, 2000, 3000, 4000]],
    [0, 10000, [0, 2500, 5000, 7500, 10000]],
    [0, 0.12, [0, 0.03, 0.06, 0.09, 0.12]],
    [-0.04, 0.8, [0, 0.2, 0.4, 0.6, 0.8]], // T-s entropy axis starts left of 0
  ];
  for (const [lo, hi, want] of cases) assert.deepEqual(ticks(lo, hi), want, `ticks(${lo}, ${hi})`);
});

test("ticks for every nice bound: 4 to 7 ticks, evenly spaced, inside the domain", () => {
  for (let n = -3; n <= 4; n++) {
    for (const s of NICE_SERIES) {
      const hi = Number((s * 10 ** n).toPrecision(12));
      const t = ticks(0, hi);
      assert.ok(t.length >= 4 && t.length <= 7, `ticks(0, ${hi}) has ${t.length}: ${t}`);
      assert.equal(t[0], 0);
      assert.ok(t[t.length - 1] <= hi * (1 + 1e-12), `ticks(0, ${hi}) overshoots`);
      const step = t[1] - t[0];
      for (let i = 1; i < t.length; i++) assertClose(t[i] - t[i - 1], step, `step ${hi}`, 1e-9);
      assert.ok(hi - t[t.length - 1] < step, `ticks(0, ${hi}) stops more than a step short`);
    }
  }
});

test("linear maps and inverts", () => {
  const x = linear([0, 1.2], [40, 520]);
  assert.equal(x(0), 40);
  assert.equal(x(1.2), 520);
  assertClose(x(0.6), 280, "midpoint");
  assertClose(x.invert(280), 0.6, "invert");
  const y = linear([0, 6000], [300, 20]); // y grows downward on screen
  assert.equal(y(0), 300);
  assert.equal(y(6000), 20);
  assertClose(y.invert(y(1838)), 1838, "round trip");
});

test("colorRamp hits the stops, interpolates between them and clamps at both ends", () => {
  const ramp = colorRamp([[250, "#feece5"], [600, "#fed3c4"], [1000, "#feb59b"], [2800, "#a83900"]]);
  assert.equal(ramp(250), "#feece5");
  assert.equal(ramp(600), "#fed3c4");
  assert.equal(ramp(1000), "#feb59b");
  assert.equal(ramp(2800), "#a83900");
  assert.equal(ramp(100), "#feece5");
  assert.equal(ramp(5000), "#a83900");
  assert.equal(ramp(NaN), "#feece5");
  // halfway from #feb59b to #a83900: (254+168)/2 = 211, (181+57)/2 = 119, (155+0)/2 = 77.5
  assert.equal(ramp(1900), "#d3774e");
  assert.throws(() => colorRamp([[0, "red"]]));
});

test("segmentedScale: the timeline bar with 2 px gaps between segments", () => {
  // Otto at 1x: 2.4, 1.4, 2.4, 1.4 s
  const total = 7.6;
  const cuts = [0, 2.4, 3.8, 6.2, 7.6].map((t) => t / total);
  const spans = cuts.slice(0, -1).map((u0, i) => ({ u0, u1: cuts[i + 1] }));
  const f = segmentedScale(spans, [0, 766], 2); // 760 px of segments + 3 gaps
  assert.equal(f(0), 0);
  assertClose(f(cuts[1] - 1e-12), 240, "end of the first segment", 1e-6);
  assertClose(f(cuts[1]), 242, "a boundary is drawn at the start of the next segment");
  assertClose(f(cuts[1] / 2), 120, "middle of the first segment");
  assertClose(f(1), 766, "end");
  assertClose(f.invert(120), cuts[1] / 2, "invert");
  assert.equal(f.invert(241), cuts[1], "a gap maps to the boundary");
  assert.equal(f.invert(-5), 0);
  assert.ok(f.invert(800) < 1 && f.invert(800) > 1 - 1e-6, "the right end stays short of 1");
  // (x = 240, a segment's right edge, is the boundary and comes back as 242.)
  for (const x of [0, 50, 239, 242, 300, 500, 765]) assertClose(f(f.invert(x)), x, `round trip ${x}`, 1e-9);
});
