// Parameter ranges and defaults (SPEC section 8), the initial state, and UI timing constants.
// The durations of the animation slots live with the timeline in core/timeline.js.

export const PARAMS = {
  otto: {
    r: { min: 4, max: 16, step: 0.5, value: 8 },
    qin: { min: 200, max: 2000, step: 10, value: 800 },
  },
  diesel: {
    r: { min: 8, max: 26, step: 0.5, value: 18 },
    rc: { min: 1.1, max: 4, step: 0.05, value: 2 },
  },
  dual: {
    r: { min: 8, max: 26, step: 0.5, value: 16 },
    rp: { min: 1, max: 3, step: 0.05, value: 1.5 },
    rc: { min: 1, max: 3, step: 0.05, value: 1.5 },
  },
};

// Shared by all three cycles.
export const SHARED = {
  T1: { min: 250, max: 400, step: 1, value: 300 },
  P1: { min: 50, max: 200, step: 1, value: 100 },
  k: { min: 1.2, max: 1.67, step: 0.01, value: 1.4 },
};

// Compare mode (SPEC section 15): the shared quantities, and the heat split of a dual side
// (fraction of the heat added at constant volume).
export const COMPARE = {
  r: { min: 8, max: 20, step: 0.5, value: 12 },
  qin: { min: 400, max: 1200, step: 10, value: 1000 },
  Pmax: { min: 4000, max: 12000, step: 100, value: 7000 },
  xv: { min: 0, max: 1, step: 0.05, value: 0.5 },
};

// Typical compression ratios of real engines, drawn as light bands on the efficiency chart
// (SPEC section 13). Change them here.
export const ENGINE_BANDS = [
  { label: "gasoline engines", r: [8, 12] },
  { label: "diesel engines", r: [14, 22] },
];

export const K_CHIPS = [1.3, 1.4, 1.667];

export const CYCLES = ["otto", "diesel", "dual"];
export const SPEEDS = [0.25, 0.5, 1, 2];

// Temperatures (K) of the gas color stops; the colors are the --gas-<T> tokens in tokens.css.
export const GAS_RAMP_T = [250, 600, 1000, 1400, 1800, 2300, 2800];

export const TIMING = {
  maxFrameSeconds: 0.1, // longest animation step per frame (SPEC section 7)
  previousGraceSeconds: 0.3, // "previous process" this close to a process start goes one further back
  ariaIntervalMs: 500, // live text alternatives update at most twice a second (SPEC section 17)
};

export const defaultValues = (group) => Object.fromEntries(Object.entries(group).map(([key, d]) => [key, d.value]));

// The whole state (BUILD_PLAN.md, "Architecture"). The page loads paused at state 1.
export function defaultState() {
  return {
    mode: "explore",
    cycle: "otto",
    shared: defaultValues(SHARED),
    params: { otto: defaultValues(PARAMS.otto), diesel: defaultValues(PARAMS.diesel), dual: defaultValues(PARAMS.dual) },
    compare: {
      constraint: "same-r-qin",
      shared: { r: COMPARE.r.value, qin: COMPARE.qin.value, Pmax: COMPARE.Pmax.value },
      a: { type: "otto", xv: COMPARE.xv.value, params: defaultValues(PARAMS.otto) },
      b: { type: "diesel", xv: COMPARE.xv.value, params: defaultValues(PARAMS.diesel) },
    },
    options: {
      strokes: false,
      shade: true,
      logAxes: false,
      pauseAtStates: false,
      showNumbers: true,
      focus: false,
      theme: "auto",
    },
    playback: { playing: false, speed: 1, slot: "C", tau: 0 },
    card: "intro",
  };
}
