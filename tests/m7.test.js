// Milestone M7: the text alternatives of the SVG views and the efficiency chart's value labels.

import test from "node:test";
import assert from "node:assert/strict";
import { buildModel, framesAt } from "../site/js/core/model.js";
import { describeFrame, describeFrames, describeState } from "../site/js/core/describe.js";
import { clearSpot } from "../site/js/core/efficiency.js";
import { defaultState } from "../site/js/state/defaults.js";

test("describeFrame names the cycle, the process and how far it has got", () => {
  const model = buildModel(defaultState());
  const [f] = framesAt(model, 0.1);
  assert.equal(describeFrame(model.cycles[0], f), `Otto cycle, process 1 to 2, isentropic compression, ${Math.round(100 * f.tau)} % complete`);
});

test("describeFrames in compare mode covers both cycles and says when one waits", () => {
  const st = { ...defaultState(), mode: "compare" };
  const model = buildModel(st);
  // Somewhere in the Diesel's constant-pressure heat addition, a slot the Otto cycle only waits through.
  const hp = model.cycles[1].timeline.slots.find((s) => s.id === "HP");
  const frames = framesAt(model, (hp.u0 + hp.u1) / 2);
  const text = describeFrames(model, frames);
  assert.match(text, /^A: Otto cycle, waiting at state 3; B: Diesel cycle, process 2 to 3, constant-pressure heat addition, \d+ % complete$/);
});

test("describeState formats the values as the readouts do", () => {
  const model = buildModel(defaultState());
  const st = model.cycles[0].solution.states["2"];
  assert.equal(describeState(st, ["P", "T"]), "P = 1838 kPa, T = 689.2 K");
});

test("clearSpot picks the first candidate whose box keeps clear of the curves", () => {
  const curve = [[0, 50], [200, 50]]; // a horizontal line at y = 50
  const box = { w: 40, h: 14 };
  // The first candidate straddles the line, the second sits above it.
  const spots = [{ x: 100, y: 50 }, { x: 100, y: 30 }, { x: 100, y: 80 }];
  assert.deepEqual(clearSpot(spots, box, [curve], 3), spots[1]);
  // Nothing clear: the one farthest from the curves.
  assert.deepEqual(clearSpot([{ x: 100, y: 60 }, { x: 100, y: 64 }, { x: 100, y: 50 }], box, [curve], 20), { x: 100, y: 64 });
});
