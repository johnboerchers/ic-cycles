// The steps of the process card (SPEC section 10): intro (state 1), one per process that is
// drawn (and the two strokes when they are on), summary. A card id is "intro", "summary" or a
// process id such as "1-2", "x-3" or "1-0".
//
// The card shown is kept in state.card. It follows the playhead: while the playhead is inside a
// process, that process's card shows; when it stops exactly at a state, the card of the process
// that just ended stays. Back and the step dots go the other way: they choose a card and put
// the playhead at the end of that process.

import { timelineSegments } from "./model.js";

// A playhead this close to the start of a slot is at the state between two processes.
const AT_STATE = 1e-6;

export function cardSteps(model) {
  return ["intro", ...timelineSegments(model).map((s) => s.processId), "summary"];
}

// The card the playhead asks for: the process it is inside, or `current` when it sits at a state.
export function playheadCard(frame, current) {
  return frame.tau > AT_STATE && frame.processId ? frame.processId : current;
}

// The card to keep after the model changed (another cycle, or a process that disappeared, such
// as x-3 of a dual cycle when r_c reaches 1): the current card if it still exists, otherwise
// the process under the playhead, or the one that ends at the state where it sits, or at
// state 1 the intro.
export function validCard(model, card, frame) {
  const steps = cardSteps(model);
  if (steps.includes(card)) return card;
  const segs = timelineSegments(model);
  if (frame.tau > AT_STATE && steps.includes(frame.processId)) return frame.processId;
  const i = segs.findIndex((s) => s.slot === frame.slot);
  return i > 0 ? segs[i - 1].processId : "intro";
}

// Phase at the start of a process (for Replay).
export function processStart(model, card) {
  const seg = timelineSegments(model).find((s) => s.processId === card);
  return seg ? seg.u0 : 0;
}

// Where the playhead goes when a card is chosen with Back or a step dot: the end of that
// process, which is exactly the start of the next one. The intro, the summary and the last
// process all end at state 1, phase 0.
export function cardPhase(model, card) {
  const segs = timelineSegments(model);
  const i = segs.findIndex((s) => s.processId === card);
  return i >= 0 && i + 1 < segs.length ? segs[i + 1].u0 : 0;
}
