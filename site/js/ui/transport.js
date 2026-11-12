// Transport bar (SPEC section 7): restart, previous process, play/pause, next process; speed;
// the timeline bar, which is the progress indicator and can be clicked or dragged to scrub;
// and the "Pause at each state" switch. All actions go through `actions` (main.js).

import { timelineSegments } from "../core/model.js";
import { segmentedScale } from "../core/scale.js";
import { CONTENT } from "../content/content.js";
import { SPEEDS, TIMING } from "../state/defaults.js";
import { htmlEl, svgEl, noMouseFocus, roleColor, px } from "./dom.js";

const GAP = 2; // px between timeline segments

// 24 x 24 icons.
const ICON = {
  restart: "M4 5h2.4v14H4zM13 5v14L6.8 12zM20.5 5v14l-6.2-7z",
  previous: "M5 5h2.4v14H5zM19 5v14L8.6 12z",
  play: "M7.5 4.5v15L19.5 12z",
  pause: "M6.5 5h4v14h-4zM13.5 5h4v14h-4z",
  next: "M5 5v14l10.4-7zM16.6 5H19v14h-2.4z",
};

const speedLabel = (s) => `${s}×`;

export function createTransport(container, actions) {
  // --- buttons
  const group = htmlEl("div", { class: "transport-buttons" }, container);
  const button = (label, key, paths, extraClass = "") => {
    const b = htmlEl("button", { type: "button", class: `icon-btn ${extraClass}`.trim(), "aria-label": label, title: `${label} (${key})` }, group);
    noMouseFocus(b);
    const icon = svgEl("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, b);
    return { b, paths: paths.map((d) => svgEl("path", { d }, icon)) };
  };
  const restart = button("Restart", "Home", [ICON.restart]);
  const previous = button("Previous process", "←", [ICON.previous]);
  const play = button("Play", "Space", [ICON.play, ICON.pause], "play");
  const next = button("Next process", "→", [ICON.next]);
  restart.b.addEventListener("click", actions.restart);
  previous.b.addEventListener("click", actions.previous);
  play.b.addEventListener("click", actions.togglePlay);
  next.b.addEventListener("click", actions.next);

  // --- speed
  const speed = htmlEl("div", { class: "speed" }, container);
  htmlEl("span", { class: "control-label", id: "speed-label", text: "Speed" }, speed);
  const speedGroup = htmlEl("div", { class: "segmented small", role: "group", "aria-labelledby": "speed-label" }, speed);
  const speedButtons = SPEEDS.map((s) => {
    const b = noMouseFocus(htmlEl("button", { type: "button", "aria-pressed": "false", text: speedLabel(s) }, speedGroup));
    b.addEventListener("click", () => actions.setSpeed(s));
    return b;
  });

  // --- timeline bar
  const bar = htmlEl("div", {
    class: "timeline",
    role: "slider",
    tabindex: "0",
    "aria-label": "Position in the cycle",
    "aria-valuemin": "0",
    "aria-valuemax": "100",
  }, container);
  const track = htmlEl("div", { class: "tl-segments" }, bar);
  const head = htmlEl("div", { class: "tl-head" }, bar);

  // --- switch
  const sw = noMouseFocus(htmlEl("label", { class: "switch" }, container));
  const pauseBox = htmlEl("input", { type: "checkbox", role: "switch" }, sw);
  htmlEl("span", { class: "switch-track", "aria-hidden": "true" }, sw);
  sw.append("Pause at each state");
  // A click on the label still focuses the checkbox; after a pointer toggle, let it go again so
  // Space keeps meaning play/pause. Keyboard users keep their focus.
  let pointerToggle = false;
  sw.addEventListener("pointerdown", () => (pointerToggle = true));
  pauseBox.addEventListener("change", () => {
    actions.setPauseAtStates(pauseBox.checked);
    if (pointerToggle) pauseBox.blur();
    pointerToggle = false;
  });

  let segments = [];
  let segEls = [];
  let scale = null;
  let width = 0;
  let lastFrames = null;
  let lastState = null;
  let shown = { playing: null, speed: null, pause: null, head: null, aria: 0, ariaText: "" };

  // Click or drag on the bar to scrub. The bar's position is read here, never per frame.
  const scrubAt = (clientX) => {
    if (!scale) return;
    const left = track.getBoundingClientRect().left;
    actions.scrub(scale.invert(clientX - left));
  };
  bar.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    bar.setPointerCapture(e.pointerId);
    scrubAt(e.clientX);
  });
  bar.addEventListener("pointermove", (e) => {
    if (bar.hasPointerCapture(e.pointerId)) scrubAt(e.clientX);
  });

  new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === width) return;
    width = entry.contentRect.width;
    rescale();
    if (lastFrames) tick(lastFrames, lastState);
  }).observe(track);

  function rescale() {
    scale = segments.length && width > 0 ? segmentedScale(segments, [0, width], GAP) : null;
    shown.head = null;
  }

  function render(model, state) {
    segments = timelineSegments(model);
    track.replaceChildren();
    segEls = segments.map((s) => {
      const el = htmlEl("div", { class: "tl-seg", style: `flex-grow:${s.seconds};--c:${roleColor(s.role)}` }, track);
      htmlEl("span", { class: "tl-label", text: s.label }, el);
      const fill = htmlEl("div", { class: "tl-fill" }, htmlEl("div", { class: "tl-bar" }, el));
      return { el, fill, frac: -1, current: false };
    });
    width = track.clientWidth;
    rescale();
    lastState = state;
  }

  function tick(frames, state) {
    lastFrames = frames;
    lastState = state;
    const f = frames[0];

    // Segments fill up as they are played; the current one's label is emphasized.
    const cur = segments.findIndex((s) => s.slot === f.slot);
    segEls.forEach((s, i) => {
      const frac = i < cur ? 1 : i === cur ? f.tau : 0;
      if (s.frac !== frac) {
        s.fill.style.transform = `scaleX(${frac})`;
        s.frac = frac;
      }
      if (s.current !== (i === cur)) {
        s.current = i === cur;
        s.el.classList.toggle("current", s.current);
      }
    });
    if (scale) {
      const x = px(scale(f.phase));
      if (shown.head !== x) {
        head.style.transform = `translateX(${x}px)`;
        shown.head = x;
      }
    }

    // Controls that mirror the state.
    const { playing, speed: sp } = state.playback;
    if (shown.playing !== playing) {
      play.paths[0].setAttribute("display", playing ? "none" : "inline");
      play.paths[1].setAttribute("display", playing ? "inline" : "none");
      play.b.setAttribute("aria-label", playing ? "Pause" : "Play");
      play.b.title = playing ? "Pause (Space)" : "Play (Space)";
      shown.playing = playing;
    }
    if (shown.speed !== sp) {
      speedButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(SPEEDS[i] === sp)));
      shown.speed = sp;
    }
    if (shown.pause !== state.options.pauseAtStates) {
      pauseBox.checked = state.options.pauseAtStates;
      shown.pause = state.options.pauseAtStates;
    }

    // The slider's value for assistive technology, at most twice a second.
    const now = performance.now();
    if (now - shown.aria >= TIMING.ariaIntervalMs || !playing) {
      const seg = segments[cur];
      const text = seg
        ? `Process ${seg.label.replace("→", " to ")}, ${CONTENT.roles[seg.role].label.toLowerCase()}, ${Math.round(100 * f.tau)} % complete`
        : "";
      if (text !== shown.ariaText) {
        bar.setAttribute("aria-valuenow", String(Math.round(100 * f.phase)));
        bar.setAttribute("aria-valuetext", text);
        shown.ariaText = text;
      }
      shown.aria = now;
    }
  }

  return { render, tick };
}
