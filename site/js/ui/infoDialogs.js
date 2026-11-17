// The "Symbols" and "Model" dialogs opened from the header (SPEC section 10), as native
// <dialog> elements. Their text comes from contentFor(state.specificHeats): CONTENT.symbols and
// CONTENT.model, or with variable specific heats the merged text (core/content.js); while
// friction is on, FRICTION's symbols and Model point are appended (SPEC section 20). The model
// dialog quotes R, k, c_v and c_p, so it is filled with the current values when it opens.

import { contentFor, dialogContent } from "../core/content.js";
import { texValues, fillValues } from "../core/values.js";
import { htmlEl, noMouseFocus } from "./dom.js";
import { renderMath, renderProse } from "./math.js";

function makeDialog(titleText) {
  const dialog = htmlEl("dialog", { class: "info-dialog" }, document.body);
  const head = htmlEl("div", { class: "dialog-head" }, dialog);
  const title = htmlEl("h2", { class: "dialog-title", text: titleText }, head);
  const close = htmlEl("button", { type: "button", class: "dialog-close", "aria-label": "Close", text: "×" }, head);
  close.addEventListener("click", () => dialog.close());
  // A click on the backdrop (outside the dialog box) closes it too.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  const body = htmlEl("div", { class: "dialog-body" }, dialog);
  return { dialog, title, body };
}

export function createInfoDialogs(symbolsButton, modelButton) {
  let values = null;
  let content = contentFor("constant");
  let friction = false;

  // Symbols: no numbers, so it is rebuilt only when the gas model or friction changes.
  const symbols = makeDialog("Symbols");
  const table = htmlEl("table", { class: "symbols" }, symbols.body);
  const tbody = htmlEl("tbody", {}, table);
  let symbolsFor = null; // { content, friction }
  function fillSymbols() {
    if (symbolsFor?.content === content && symbolsFor.friction === friction) return;
    tbody.replaceChildren();
    for (const s of dialogContent(content, friction).symbols) {
      const tr = htmlEl("tr", {}, tbody);
      renderMath(htmlEl("td", { class: "sym-tex" }, tr), s.tex);
      renderProse(htmlEl("td", { class: "sym-name" }, tr), s.name);
      htmlEl("td", { class: "sym-unit", text: s.unit }, tr);
    }
    symbolsFor = { content, friction };
  }

  const model = makeDialog(content.model.title);
  function fillModel() {
    model.title.textContent = content.model.title;
    model.body.replaceChildren();
    const list = (items) => {
      const ul = htmlEl("ul", {}, model.body);
      for (const text of items) renderProse(htmlEl("li", {}, ul), fillValues(text, values));
    };
    list(dialogContent(content, friction).points);
    htmlEl("h3", { class: "dialog-subtitle", text: "Caveats" }, model.body);
    list(content.model.caveats);
  }

  noMouseFocus(symbolsButton).addEventListener("click", () => {
    fillSymbols();
    symbols.dialog.showModal();
  });
  noMouseFocus(modelButton).addEventListener("click", () => {
    fillModel();
    model.dialog.showModal();
  });

  return {
    render(m, state) {
      content = contentFor(state.specificHeats);
      friction = Boolean(m.friction);
      values = texValues(m.cycles[0].solution, m.cycles[0].cold?.solution, m.friction ?? undefined);
      if (model.dialog.open) fillModel();
      if (symbols.dialog.open) fillSymbols();
    },
    tick() {},
  };
}
