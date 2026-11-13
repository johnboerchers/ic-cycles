// Wiring: the store, the model, the views and the one animation clock (BUILD_PLAN.md,
// "Architecture"). Views get render(model, state) when parameters or options change and
// tick(frames, state) on every animation frame and every scrub.

import { createStore } from "./state/store.js";
import { defaultState, defaultValues, CYCLES, TIMING, PARAMS, SHARED } from "./state/defaults.js";
import {
  buildModel, phaseOf, framesAt, nextBoundary, previousStart, advancePhase,
} from "./core/model.js";
import { createHeader, darkQuery, isDark } from "./ui/header.js";
import { createEngineView } from "./ui/engineView.js";
import { createDiagramView } from "./ui/diagramView.js";
import { createTransport } from "./ui/transport.js";
import { createParamsPanel } from "./ui/paramsPanel.js";
import { createResultsPanel } from "./ui/resultsPanel.js";
import { createStateTable } from "./ui/stateTable.js";
import { createProcessCard } from "./ui/processCard.js";
import { createEnergyView } from "./ui/energyView.js";
import { createInfoDialogs } from "./ui/infoDialogs.js";
import { createEfficiencyView } from "./ui/efficiencyView.js";
import { createCompareView } from "./ui/compareView.js";
import { cardSteps, playheadCard, validCard, processStart, cardPhase } from "./core/steps.js";

// A theme chosen earlier with the header toggle was applied by index.html before the page drew.
const initialState = defaultState();
const savedTheme = document.documentElement.dataset.theme;
if (savedTheme === "light" || savedTheme === "dark") initialState.options.theme = savedTheme;

const store = createStore(initialState);
let model = buildModel(store.get());
let phase = phaseOf(model, store.get().playback);
let pendingStops = 0; // "next process": states still to reach before stopping (each press adds one)
let rafId = 0;
let lastTime = null;

const timeline = () => model.cycles[0].timeline;

// Moves the playhead to a phase; it is stored as slot and tau (PHYSICS.md section 6). The
// process card follows: inside a process it shows that process (core/steps.js). Compare mode
// has no process card, so the card is left as it was for the return to Explore.
function setPhase(u, patch = {}) {
  const st = store.get();
  const [f] = framesAt(model, u);
  const playback = { ...st.playback, slot: f.slot, tau: f.tau, ...patch };
  const card = st.mode === "compare" ? st.card : playheadCard(f, st.card);
  store.set(card === st.card ? { playback } : { playback, card });
}

// Shows a card and puts the playhead, paused, at the end of that process (SPEC section 10).
function showCard(card) {
  const [f] = framesAt(model, cardPhase(model, card));
  pendingStops = 0;
  store.set({ card, playback: { ...store.get().playback, slot: f.slot, tau: f.tau, playing: false } });
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
    const st = store.get();
    if (st.mode === "explore" && cycle !== st.cycle) store.set({ cycle });
  },
  // Explore or Compare. The playhead keeps its slot and tau, like a parameter change.
  setMode(mode) {
    if (mode !== store.get().mode) store.set({ mode });
  },
  // ---- compare mode (SPEC section 15)
  setCompareConstraint(constraint) {
    const { compare } = store.get();
    if (compare.constraint !== constraint) store.set({ compare: { ...compare, constraint } });
  },
  setCompareShared(key, value) {
    const { compare } = store.get();
    if (compare.shared[key] !== value) store.set({ compare: { ...compare, shared: { ...compare.shared, [key]: value } } });
  },
  // A side's type; its own parameters start from that type's defaults.
  setCompareType(side, type) {
    const { compare } = store.get();
    if (compare[side].type === type) return;
    store.set({ compare: { ...compare, [side]: { ...compare[side], type, params: defaultValues(PARAMS[type]) } } });
  },
  setCompareXv(side, xv) {
    const { compare } = store.get();
    if (compare[side].xv !== xv) store.set({ compare: { ...compare, [side]: { ...compare[side], xv } } });
  },
  setCompareParam(side, key, value) {
    const { compare } = store.get();
    const s = compare[side];
    if (s.params[key] !== value) store.set({ compare: { ...compare, [side]: { ...s, params: { ...s.params, [key]: value } } } });
  },
  // A parameter of the current cycle ("params") or a shared one ("shared": T1, P1, k). The
  // playhead keeps its slot and tau, so a paused piston stays where it is (SPEC section 8).
  setParam(group, key, value) {
    const st = store.get();
    if (group === "shared") {
      if (st.shared[key] !== value) store.set({ shared: { ...st.shared, [key]: value } });
      return;
    }
    const own = st.params[st.cycle];
    if (own[key] !== value) store.set({ params: { ...st.params, [st.cycle]: { ...own, [key]: value } } });
  },
  // Reset restores every value in the panel: the current cycle's parameters and T1, P1, k.
  resetParams() {
    const st = store.get();
    store.set({ shared: defaultValues(SHARED), params: { ...st.params, [st.cycle]: defaultValues(PARAMS[st.cycle]) } });
  },
  setOption(key, value) {
    store.merge("options", { [key]: value });
  },
  // Focus view (SPEC section 4): the stage fills the viewport, text about 25 % larger.
  toggleFocus() {
    store.merge("options", { focus: !store.get().options.focus });
  },
  // The header toggle picks the opposite of the theme on screen, whatever the OS says, and is
  // remembered for the next visit.
  toggleTheme() {
    const theme = isDark(store.get().options.theme) ? "light" : "dark";
    try {
      localStorage.setItem("ic-cycles-theme", theme);
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
    store.merge("options", { theme });
  },
  // ---- process card (SPEC section 10)
  // Guided tour: back to state 1, "Pause at each state" on, the intro showing.
  guidedTour() {
    pendingStops = 0;
    const st = store.get();
    store.set({
      card: "intro",
      options: { ...st.options, pauseAtStates: true },
      playback: { ...st.playback, playing: false, slot: "C", tau: 0 },
    });
  },
  // Next plays the next process and stops at its end. Once the last process has finished
  // (the playhead is back at state 1), Next shows the summary.
  cardNext() {
    const { card, playback } = store.get();
    const steps = cardSteps(model);
    if (card === "summary") return;
    const last = steps[steps.length - 2];
    if (card === last && !playback.playing && phase === 0) store.set({ card: "summary" });
    else actions.next();
  },
  cardBack() {
    const steps = cardSteps(model);
    const i = steps.indexOf(store.get().card);
    if (i > 0) showCard(steps[i - 1]);
  },
  goToCard(card) {
    showCard(card);
  },
  // Plays the card's process again from its start and stops at its end.
  replayCard() {
    const { card } = store.get();
    if (card === "intro" || card === "summary") return;
    pendingStops = 0;
    setPhase(processStart(model, card), { playing: false });
    actions.next();
  },
  // Scrubbing (and dragging the state point) pauses playback and moves everything to the phase under the pointer.
  scrub(u) {
    pendingStops = 0;
    setPhase(u, { playing: false });
  },
};

// The single-cycle panels are hidden in compare mode (SPEC section 15) and sit still there; going
// back to Explore rebuilds the model, so they are rendered again at once.
function exploreOnly(view) {
  return {
    render: (m, st) => st.mode === "explore" && view.render(m, st),
    tick: (frames, st) => st.mode === "explore" && view.tick(frames, st),
  };
}

const views = [
  createHeader(document.getElementById("cycle-select"), actions),
  createEngineView(document.getElementById("engine-panel")),
  createDiagramView(document.getElementById("pv-panel"), { kind: "pv", actions }),
  createDiagramView(document.getElementById("ts-panel"), { kind: "ts", actions }),
  createTransport(document.getElementById("transport"), actions),
  exploreOnly(createParamsPanel(document.getElementById("params-panel"), actions)),
  exploreOnly(createResultsPanel(document.getElementById("results-panel"))),
  exploreOnly(createStateTable(document.getElementById("states-panel"))),
  exploreOnly(createEnergyView(document.getElementById("energy-panel"))),
  exploreOnly(createProcessCard(document.getElementById("card-panel"), actions)),
  createInfoDialogs(document.getElementById("symbols-btn"), document.getElementById("model-btn")),
  createCompareView(document.getElementById("compare-panel"), { actions, results: document.getElementById("compare-results-panel") }),
  createEfficiencyView(document.getElementById("efficiency-panel"), { actions }),
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
  if (rebuild) {
    model = buildModel(state);
    // A card whose process no longer exists (another cycle, or x-3 when r_c reaches 1) is
    // replaced; listeners may not set state themselves, so this follows right after.
    const [f] = framesAt(model, phaseOf(model, state.playback));
    const card = validCard(model, state.card, f);
    if (card !== state.card && state.mode === "explore") queueMicrotask(() => store.set({ card: validCard(model, store.get().card, f) }));
  }
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
  if (document.querySelector("dialog[open]")) return; // keys belong to an open dialog
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
    case "f":
    case "F":
      actions.toggleFocus();
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

// The OS switching between light and dark: the views that read colors from the tokens (the
// gas color ramp) draw again. A theme picked with the toggle ignores this.
darkQuery.addEventListener("change", () => {
  const st = store.get();
  for (const v of views) v.render(model, st);
  show(st);
});

// ------------------------------------------------------------------------------ start

const initial = store.get();
for (const v of views) v.render(model, initial);
show(initial);
