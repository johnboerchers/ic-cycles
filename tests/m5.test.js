// Tests for the M5 core helpers: the energy table (SPEC section 12) with and without the
// intake and exhaust strokes.
import test from "node:test";
import assert from "node:assert/strict";
import { energyTable, energyProgress } from "../site/js/core/energy.js";
import { buildModel, framesAt, timelineSegments } from "../site/js/core/model.js";
import { defaultState } from "../site/js/state/defaults.js";
import { formatValue } from "../site/js/core/format.js";
import { assertClose } from "./helpers.js";

const modelFor = (cycle, strokes = false) => {
  const d = defaultState();
  return buildModel({ ...d, cycle, options: { ...d.options, strokes } });
};
const fmt = (x) => formatValue("q", Math.abs(x));

test("energy: default Otto rows, totals and the shared scale", () => {
  const { rows, totals, max } = energyTable(modelFor("otto"));
  assert.deepEqual(rows.map((r) => r.processId), ["1-2", "2-3", "3-4", "4-1"]);
  assert.equal(fmt(rows[0].w), "279.3");
  assert.equal(fmt(rows[1].q), "800.0");
  assert.equal(fmt(rows[2].w), "731.0");
  assert.equal(fmt(rows[3].q), "348.2");
  assert.equal(formatValue("w", totals.wnet), "451.8");
  assertClose(totals.sumDu, 0, "sum of du");
  assert.equal(formatValue("eta", totals.wnet / totals.qin), "56.5 %");
  for (const r of rows) assertClose(r.du, r.q - r.w, `du ${r.processId}`);
  assertClose(max, 800, "largest magnitude");
});

test("energy: default Diesel 2-3 has heat, work and du at once", () => {
  const r = energyTable(modelFor("diesel")).rows.find((x) => x.processId === "2-3");
  assert.equal(fmt(r.q), "957.6");
  assert.equal(fmt(r.w), "273.6");
  assert.equal(formatValue("u", r.du), "684.0");
});

test("energy: with the strokes on, two rows that cancel and do not change the totals", () => {
  const off = energyTable(modelFor("otto"));
  const on = energyTable(modelFor("otto", true));
  assert.deepEqual(on.rows.map((r) => r.processId), ["1-2", "2-3", "3-4", "4-1", "1-0", "0-1"]);
  const [ex, inn] = on.rows.slice(4);
  assert.ok(ex.stroke && inn.stroke);
  assert.equal(fmt(ex.w), "75.3");
  assert.equal(fmt(inn.w), "75.3");
  assert.ok(ex.w < 0 && inn.w > 0, "exhaust is work in, intake work out");
  assertClose(ex.w + inn.w, 0, "strokes cancel");
  assert.equal(ex.q, 0);
  assert.equal(ex.du, 0);
  assert.deepEqual(on.totals, off.totals);
});

test("energy: progress resets at state 1, fills the current row, keeps done rows full", () => {
  const model = modelFor("otto", true);
  const { rows } = energyTable(model);
  const segs = timelineSegments(model);
  const at = (u) => energyProgress(rows, framesAt(model, u)[0]);

  const start = at(0);
  assert.equal(start[0].status, "current");
  assertClose(start[0].w, 0, "no work yet");
  assert.ok(start.slice(1).every((p) => p.status === "ahead"));

  // Halfway through 3-4: 1-2 and 2-3 full, 3-4 partly done.
  const e = segs.find((s) => s.processId === "3-4");
  const mid = at((e.u0 + e.u1) / 2);
  assert.deepEqual(mid.map((p) => p.status), ["done", "done", "current", "ahead", "ahead", "ahead"]);
  assert.ok(mid[2].w > 0 && mid[2].w < rows[2].w);

  // During the exhaust stroke: the running work is negative (work on the gas).
  const x = segs.find((s) => s.processId === "1-0");
  const ex = at((x.u0 + x.u1) / 2);
  assert.equal(ex[4].status, "current");
  assert.ok(ex[4].w < 0 && ex[4].w > rows[4].w);
});

test("loop label: placed inside the loop, clear of its edges, or not at all", async () => {
  const { insidePolygon, labelSpot } = await import("../site/js/core/pick.js");
  const square = [[0, 0], [100, 0], [100, 100], [0, 100]];
  assert.ok(insidePolygon(square, 50, 50));
  assert.ok(!insidePolygon(square, 150, 50));
  const spot = labelSpot(square, 30, 16);
  // A wide label goes in the middle across; any height well inside the square is as good.
  assert.ok(Math.abs(spot.x - 50) < 5, "centered across");
  assert.ok(spot.y > 20 && spot.y < 80, "clear of top and bottom");
  // A sliver 10 px tall cannot hold a 16 px label.
  assert.equal(labelSpot([[0, 0], [200, 0], [200, 10], [0, 10]], 30, 16), null);
});
