// Typesetting with the vendored KaTeX (site/vendor/katex). If KaTeX cannot be loaded, or
// rejects a string, the raw TeX is shown instead, so nothing ever silently disappears.
//   renderMath(el, tex, { display })   one equation into `el`
//   renderProse(el, text)              prose with inline math between $…$

let katex = null;
try {
  katex = (await import("../../vendor/katex/katex.mjs")).default;
} catch (e) {
  console.warn("KaTeX did not load; equations are shown as TeX.", e);
}

export function renderMath(el, tex, { display = false } = {}) {
  if (katex) {
    try {
      katex.render(tex, el, { displayMode: display, throwOnError: true, output: "htmlAndMathml" });
      return el;
    } catch (e) {
      console.warn(`KaTeX could not render: ${tex}`, e);
    }
  }
  el.textContent = tex;
  el.classList.add("raw-tex");
  return el;
}

// Appends prose to `el`: plain text as text nodes, each $…$ as an inline equation.
export function renderProse(el, text) {
  text.split("$").forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 0) el.append(part);
    else el.append(renderMath(document.createElement("span"), part));
  });
  return el;
}
