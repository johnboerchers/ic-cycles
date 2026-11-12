// Process card (SPEC section 10): one step of the cycle at a time, with the wording and the
// equations from content/content.js. Steps: intro (state 1), one per process, summary.
// The card shown is state.card; main.js keeps it in step with the playhead (core/steps.js).
// render() rebuilds the card body (new card, new parameters, numbers on or off); tick() does
// nothing, because the card only changes through the store.

import { CONTENT } from "../content/content.js";
import { timelineSegments, framesAt, phaseOf } from "../core/model.js";
import { cardSteps, validCard } from "../core/steps.js";
import { texValues, fillValues } from "../core/values.js";
import { htmlEl, makeSwitch, noMouseFocus, roleColor, symbolHtml } from "./dom.js";
import { renderMath, renderProse } from "./math.js";

const ARROW = { up: "↑", down: "↓" };
const TREND_WORD = { up: "rises", down: "falls", const: "constant" };

const arrowLabel = (id) => id.replace("-", "→");

// Wording of a process card: the cycle's own, or a stroke card.
function processContent(cycle, id) {
  return CONTENT.cycles[cycle].processes[id] ?? CONTENT.strokes[id];
}

export function createProcessCard(container, actions) {
  container.classList.add("card-panel");
  const head = htmlEl("div", { class: "panel-head" }, container);
  head.append(container.querySelector(".panel-title"));
  const tour = noMouseFocus(htmlEl("button", { type: "button", class: "card-btn", text: "Guided tour" }, head));
  tour.title = "Start again at state 1 and go through the cycle one process at a time";
  tour.addEventListener("click", () => actions.guidedTour());

  const dots = htmlEl("ol", { class: "card-dots", "aria-label": "Steps" }, container);
  const body = htmlEl("div", { class: "card-body", "aria-live": "polite" }, container);

  const foot = htmlEl("div", { class: "card-foot" }, container);
  const back = noMouseFocus(htmlEl("button", { type: "button", class: "card-btn", text: "← Back" }, foot));
  const replay = noMouseFocus(htmlEl("button", { type: "button", class: "card-btn", text: "Replay" }, foot));
  const next = noMouseFocus(htmlEl("button", { type: "button", class: "card-btn primary", text: "Next →" }, foot));
  const numbers = makeSwitch(foot, "Show numbers", (on) => actions.setOption("showNumbers", on), "small card-numbers");
  back.addEventListener("click", () => actions.cardBack());
  next.addEventListener("click", () => actions.cardNext());
  replay.addEventListener("click", () => actions.replayCard());

  // ---------------------------------------------------------------- building blocks

  function prose(parent, cls, text, values, label) {
    const p = htmlEl("p", { class: cls }, parent);
    if (label) htmlEl("span", { class: "card-label", text: label }, p);
    renderProse(p, fillValues(text, values));
    return p;
  }

  function equations(parent, list, values) {
    const box = htmlEl("div", { class: "card-eqs" }, parent);
    for (const eq of list) {
      const item = htmlEl("div", { class: "card-eq" }, box);
      renderMath(htmlEl("div", { class: "eq-sym" }, item), eq.tex, { display: true });
      renderMath(htmlEl("div", { class: "eq-num" }, item), fillValues(eq.num, values), { display: true });
    }
  }

  function trends(parent, tr) {
    const row = htmlEl("div", { class: "card-trends" }, parent);
    for (const key of ["P", "T", "v", "s"]) {
      const cell = htmlEl("span", { class: "trend", title: `${key} ${TREND_WORD[tr[key]]}` }, row);
      symbolHtml(cell, key);
      htmlEl("span", { class: `trend-mark ${tr[key]}`, text: ARROW[tr[key]] ?? "const" }, cell);
    }
  }

  function title(parent, text, { role, states } = {}) {
    const h = htmlEl("h3", { class: "card-title" }, parent);
    if (role) htmlEl("span", { class: "chip", style: `background:${roleColor(role)}` }, h);
    if (states) htmlEl("span", { class: "card-states", text: states }, h);
    h.append(text);
  }

  // ---------------------------------------------------------------- render

  function render(model, state) {
    const { cycle } = state;
    const cycleText = CONTENT.cycles[cycle];
    const frame = framesAt(model, phaseOf(model, state.playback))[0];
    const card = validCard(model, state.card, frame);
    const steps = cardSteps(model);
    const index = steps.indexOf(card);
    const roles = Object.fromEntries(timelineSegments(model).map((s) => [s.processId, s.role]));
    const values = texValues(model.cycles[0].solution);

    container.classList.toggle("hide-numbers", !state.options.showNumbers);
    numbers.checked = state.options.showNumbers;

    // Step dots: one button per step, the current one filled.
    dots.replaceChildren();
    steps.forEach((id, i) => {
      const li = htmlEl("li", {}, dots);
      const name =
        id === "intro" ? "State 1" : id === "summary" ? "Summary" : `${arrowLabel(id)} ${processContent(cycle, id).title}`;
      const b = noMouseFocus(htmlEl("button", { type: "button", class: "dot", title: name, "aria-label": name }, li));
      if (roles[id]) b.style.setProperty("--dot", roleColor(roles[id]));
      if (i === index) b.setAttribute("aria-current", "step");
      b.addEventListener("click", () => actions.goToCard(id));
    });

    body.replaceChildren();
    if (card === "intro" || card === "summary") {
      const c = cycleText[card];
      title(body, c.title);
      prose(body, "card-text", c.text, values);
      equations(body, c.equations, values);
      if (c.notice) prose(body, "card-notice", c.notice, values, "Notice");
    } else {
      const c = processContent(cycle, card);
      title(body, c.title, { role: roles[card], states: arrowLabel(card) });
      if (CONTENT.strokes[card]) prose(body, "card-note", CONTENT.strokes.note, values);
      prose(body, "card-text", c.what, values);
      prose(body, "card-text", c.engine, values, "In the engine");
      trends(body, c.trends);
      prose(body, "card-text", c.energy, values);
      equations(body, c.equations, values);
      prose(body, "card-notice", c.notice, values, "Notice");
    }

    back.disabled = index <= 0;
    next.disabled = index >= steps.length - 1;
    replay.disabled = card === "intro" || card === "summary";
  }

  return { render, tick() {} };
}
