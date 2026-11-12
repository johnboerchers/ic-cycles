# IC cycles: an interactive Otto, Diesel and dual cycle explorer

A static web page for undergraduate thermodynamics students. An animated piston–cylinder moves
in step with the state point on P–v and T–s diagrams of the ideal air-standard cycles. It is
used two ways: projected in lecture by the instructor, and by students on their own. It will be
hosted on GitHub Pages. The owner teaches thermodynamics: report in plain language and lead
with what to look at and try, not with how the code works.

## Where things are

| Path | What |
|---|---|
| `docs/BUILD_PLAN.md` | Milestones in order, with acceptance checks. **Start here.** Progress and notes between sessions live there |
| `docs/SPEC.md` | What to build: layout, views, behavior, visual design |
| `docs/PHYSICS.md` | The thermodynamic model, the timeline that drives the animation, the core API |
| `site/` | The website. Only this folder is published |
| `site/js/core/` | Pure model code, no DOM. Tested under Node |
| `site/js/content/content.js` | All teaching text and equations. Already written: wire it in, do not rewrite it |
| `tests/` | `node:test` files. `tests/fixtures/reference-cycles.json` is the oracle for the model |
| `tools/reference_cycles.py` | Independent Python reference that generates the fixture |

## How to work here

- Work one milestone per session, following "For the model: how to run a milestone" in
  `docs/BUILD_PLAN.md`. Read only the doc sections that milestone lists.
- The docs were written to be followed, and the decisions in them are settled. If something
  looks wrong or contradictory, say so in your report and in the plan's notes; do not quietly
  build something else.
- Stop at the end of the milestone and report. Do not roll on into the next one.

## Rules

- **No frameworks, no bundler, no npm dependencies, no CDN.** Vanilla ES modules, SVG and CSS.
  The site must work when `site/` is served as static files. KaTeX is the one third-party
  library and it is vendored into `site/vendor/katex/` (milestone M4).
- **`site/js/core/` stays pure**: no `window`, no `document`. Anything with logic worth testing
  belongs there, and views stay thin.
- **The fixture is the oracle.** Implement `docs/PHYSICS.md` exactly. If a test against the
  fixture fails, the JavaScript is wrong. Never edit the fixture by hand, loosen a tolerance or
  skip a test to get to green. If you believe the reference itself is wrong, stop and report.
- **Notation is Çengel & Boles** (SPEC section 3): P, v, T, s, k, r, r_c, MEP, states
  1-2-x-3-4, heat and work as magnitudes with in/out subscripts. SI units only.
- **Colors come from the tokens** in SPEC section 16. They were validated for color-vision
  deficiency as a set; do not substitute others. Text is never drawn in a process color.
- **Per-frame code only updates existing elements.** `render` may build DOM, `tick` may not.
- All asset paths are relative (the site is served from `/ic-cycles/`).
- Do not copy text or figures from the textbook. Do not add the instructor's name, email or
  institution anywhere unless asked (the copyright line in `LICENSE` is the one exception).
- Plain, readable code with short comments where the physics is not obvious. No abstractions
  for hypothetical future features; SPEC section 18 lists what is out of scope.

## Commands

```bash
npm test          # all tests (Node's built-in runner, no install needed)
npm run serve     # serve site/ at http://localhost:8000
npm run fixture   # regenerate the fixture from the Python reference (rarely needed)
```

## Verifying

Tests cover the model, not the page. For anything visible, open the page and look:

- In the Claude desktop app, start the preview server named `ic-cycles` (it is defined in
  `.claude/launch.json`) and use the browser tools: read the page, take screenshots at
  1366 × 768, check the console for errors, and go through the milestone's "Check in the
  browser" list, including the numbers.
- If no browser tool is available in your session, say so plainly in your report. Do not
  describe unverified behavior as working.
- If a `dataviz` skill is available, read it before building or changing a diagram or chart.
  Where it disagrees with SPEC.md, SPEC.md wins.

## Git

- This is a solo project: commit directly to `main`, one commit per milestone with the message
  given in the plan (plus small fix-up commits if needed).
- **Until the site is public** (before M7 part B): push to `origin main` at the end of each
  milestone.
- **Once the site is public:** a push deploys to students. Commit locally, tell the instructor
  what changed, and push only when they say so.
- Never make the repository public, enable Pages or change repository settings without asking
  the instructor first.
