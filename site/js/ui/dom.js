// Small helpers for building DOM and SVG in the views.

const SVG_NS = "http://www.w3.org/2000/svg";

function setAttrs(node, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key === "text") node.textContent = value;
    else node.setAttribute(key, String(value));
  }
  return node;
}

// An SVG element with attributes (and `text`), appended to `parent` when one is given.
export function svgEl(name, attrs = {}, parent = null) {
  const node = setAttrs(document.createElementNS(SVG_NS, name), attrs);
  if (parent) parent.append(node);
  return node;
}

// An HTML element with attributes (and `text`), appended to `parent` when one is given.
export function htmlEl(tag, attrs = {}, parent = null) {
  const node = setAttrs(document.createElement(tag), attrs);
  if (parent) parent.append(node);
  return node;
}

// SVG text for a symbol in italics, an optional subscript and optional plain text after it:
// symbolText(g, {...}, "q", { sub: "in" }) or symbolText(g, {...}, "P", { after: " (kPa)" }).
// Returns the <text> and the subscript <tspan>, whose text a view may change later.
export function symbolText(parent, attrs, symbol, { sub, after } = {}) {
  const text = svgEl("text", attrs, parent);
  svgEl("tspan", { "font-style": "italic", text: symbol }, text);
  let subSpan = null;
  if (sub !== undefined) subSpan = svgEl("tspan", { class: "sub", dy: "0.35em", text: sub }, text);
  if (after) svgEl("tspan", { dy: sub !== undefined ? "-0.35em" : null, text: after }, text);
  return { text, sub: subSpan };
}

// Pixel coordinates rounded to 0.1 px keep attribute strings short.
export const px = (x) => Math.round(x * 10) / 10;

// Builds an SVG path "M x y L x y ..." from [x, y] pairs.
export function polyline(points) {
  let d = "";
  for (let i = 0; i < points.length; i++) d += `${i ? "L" : "M"}${px(points[i][0])} ${px(points[i][1])}`;
  return d;
}

// The fill or stroke color of a process role, from the tokens.
export const roleColor = (role) => `var(--role-${role})`;

// Buttons that should not take focus on a mouse click, so that Space and the arrow keys keep
// driving playback afterwards (keyboard focus with Tab still works as usual).
export function noMouseFocus(node) {
  node.addEventListener("mousedown", (e) => e.preventDefault());
  return node;
}
