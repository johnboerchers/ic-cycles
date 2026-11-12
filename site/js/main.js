// Wiring: the store, the model, the views and the one animation clock (BUILD_PLAN.md,
// "Architecture"). Views get render(model, state) when parameters or options change and
// tick(frames, state) on every animation frame and every scrub.

import { createStore } from "./state/store.js";
import { defaultState, CYCLES, TIMING } from "./state/defaults.js";
import {
  buildModel, phaseOf, framesAt, nextBoundary, previousStart, advancePhase,
} from "./core/model.js";
import { createHeader } from "./ui/header.js";
import { createEngineView } from "./ui/engineView.js";
import { createDiagramView } from "./ui/diagramView.js";
import { createTransport } from "./ui/transport.js";

const store = createStore(defaultState());
let model = buildModel(store.get());
let phase = phaseOf(model, store.get().playback);
let pendingStops = 0; // "next process": states still to reach before stopping (each press adds one)
let rafId = 0;
let lastTime = null;

const timeline = () => model.cycles[0].timeline;

// Moves the playhead to a phase; it is stored as slot and tau (PHYSICS.md section 6).
function setPhase(u, patch = {}) {
  const [f] = framesAt(model, u);
  store.merge("playback", { slot: f.slot, tau: f.tau, ...patch });
}

const actions = {
  togglePlay() {
    pendingStops = 0;
    store.merge("playback", { playing: !store.get().playback.playing });
  },
  restart() {
    pendingStops = 0;
    setPhase(0);
  },
  // Plays the rest of the current process and stops at the next state (SPEC section 7).
  // Pressed again while that is playing, it goes one process further.
  next() {
    pendingStops = store.get().playback.playing && pendingStops > 0 ? pendingStops + 1 : 1;
    store.merge("playback", { playing: true });
  },
  // Jumps to the start of this process, or of the previous one when already at its start.
  previous() {
    const grace = TIMING.previousGraceSeconds / timeline().totalSeconds;
    setPhase(previousStart(timeline(), phase, grace));
  },
  setSpeed(speed) {
    store.merge("playback", { speed });
  },
  setPauseAtStates(on) {
    store.merge("options", { pauseAtStates: on });
  },
  selectCycle(cycle) {
    if (cycle !== store.get().cycle) store.set({ cycle });
  },
  // Scrubbing pauses playback and moves everything to the phase under the pointer.
  scrub(u) {
    pendingStops = 0;
    setPhase(u, { playing: false });
  },
};

const views = [
  createHeader(document.getElementById("cycle-select"), actions),
  createEngineView(document.getElementById("engine-panel")),
  createDiagramView(document.getElementById("pv-panel"), { kind: "pv" }),
  createTransport(document.getElementById("transport"), actions),
];

function modelInputsChanged(state, prev) {
  return (
    state.mode !== prev.mode ||
    state.cycle !== prev.cycle ||
    state.shared !== prev.shared ||
    state.params !== prev.params ||
    state.compare !== prev.compare ||
    state.options.strokes !== prev.options.strokes
  );
}

function show(state) {
  phase = phaseOf(model, state.playback);
  const frames = framesAt(model, phase);
  for (const v of views) v.tick(frames, state);
}

store.subscribe((state, prev) => {
  const rebuild = modelInputsChanged(state, prev);
  if (rebuild) model = buildModel(state);
  if (rebuild || state.options !== prev.options || state.card !== prev.card) {
    for (const v of views) v.render(model, state);
  }
  show(state);
  if (state.playback.playing && !prev.playback.playing) startClock();
  if (!state.playback.playing) stopClock();
});

// ------------------------------------------------------------------------------ the clock

function startClock() {
  if (rafId) return;
  lastTime = null;
  rafId = requestAnimationFrame(step);
}

function stopClock() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  lastTime = null;
}

function step(now) {
  rafId = requestAnimationFrame(step);
  const { playback, options } = store.get();
  // The time step is clamped so a stalled tab does not jump ahead (SPEC section 7).
  const dt = lastTime === null ? 0 : Math.min(TIMING.maxFrameSeconds, (now - lastTime) / 1000);
  lastTime = now;
  const stopAt = options.pauseAtStates || pendingStops > 0 ? nextBoundary(timeline(), phase) : null;
  const moved = advancePhase(timeline(), phase, dt * playback.speed, stopAt);
  let stop = moved.stopped;
  if (stop && pendingStops > 1) stop = false; // more "next" presses are queued
  if (moved.stopped) pendingStops = Math.max(0, pendingStops - 1);
  setPhase(moved.phase, stop ? { playing: false } : {});
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && store.get().playback.playing) actions.togglePlay();
});

// ------------------------------------------------------------------------------ keyboard

// Keys act only when focus is not in a control that uses them itself (SPEC section 7).
function typingTarget(el) {
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "reset"].includes(el.type);
}

document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || typingTarget(e.target)) return;
  const onButton = e.target.tagName === "BUTTON" || e.target.tagName === "INPUT";
  switch (e.key) {
    case " ":
      if (onButton) return; // Space presses a focused button, as usual
      if (!e.repeat) actions.togglePlay();
      break;
    case "ArrowLeft":
      actions.previous();
      break;
    case "ArrowRight":
      actions.next();
      break;
    case "Home":
      actions.restart();
      break;
    case "1":
    case "2":
    case "3":
      actions.selectCycle(CYCLES[Number(e.key) - 1]);
      break;
    default:
      return;
  }
  e.preventDefault();
});

// ------------------------------------------------------------------------------ start

const initial = store.get();
for (const v of views) v.render(model, initial);
show(initial);
