# Build plan

Seven milestones, done in order, one per session. Each ends with something the instructor can
open and look at.

## Status

- [x] M0 Setup: docs, reference fixture, teaching content, repository
- [x] M1 Core model
- [x] M2 First light: engine, P–v diagram, transport
- [x] M3 Interactivity: parameters, results, T–s, dragging, state table
- [ ] M4 Guided step-through and equations
- [ ] M5 Energy bookkeeping, area shading, intake and exhaust strokes
- [ ] M6 Efficiency curves and compare mode
- [ ] M7 Polish and publish

## For the instructor: how to run this

Start a new session for each milestone (a fresh session costs fewer tokens than a long one),
with the model set to Opus, and say:

> Do milestone M1 in docs/BUILD_PLAN.md.

When it reports back, open the page (`npm run serve`, then http://localhost:8000), try the
things it lists, and tell it what you want changed before moving on. Good moments to look
closely are after M2 and M3, when the look and feel is set and little has been built on top of
it. After M4 and M6 it is worth asking a stronger model to review the explanations and the
compare logic.

## For the model: how to run a milestone

1. Read the milestone's section below and only the SPEC and PHYSICS sections it lists.
2. Look at where things stand: the status list above, "Notes between sessions" at the bottom,
   `git log --oneline -5`, and run `npm test`. It must be green before you start. If an earlier
   milestone is unchecked, stop and say so.
3. Build what the milestone lists. Do not start the next milestone's work, and do not add
   features that are not in SPEC.md.
4. Verify: run the tests, then open the page in a browser and go through the milestone's
   "Check in the browser" list (how: CLAUDE.md, "Verifying").
5. Tick the milestone in the status list and add two to six lines under "Notes between
   sessions": anything the next session needs that it cannot see quickly in the code, such as a
   deviation from the spec and why, or a known rough edge.
6. Commit with the message given and push (CLAUDE.md, "Git").
7. Report and stop: what you built, what you verified and how, what you could not verify, and
   three things for the instructor to try.

If something in the docs is ambiguous, contradictory or looks wrong, do not guess silently:
choose the reading that best serves a student learning the cycle, write it in the notes, and
mention it in your report.

## Architecture every milestone follows

```
site/
  index.html
  css/tokens.css  css/app.css
  js/main.js              wiring: store, model, views, animation clock
  js/core/                pure model code, no DOM (PHYSICS.md section 9)
  js/core/model.js        buildModel(state) → everything the views draw
  js/core/scale.js        linear/log scales, nice bounds, ticks
  js/state/store.js       tiny observable store
  js/state/defaults.js    parameter ranges and defaults (SPEC section 8), timing constants
  js/ui/*.js              one file per view
  js/content/content.js   teaching text (already written)
  vendor/katex/           added in M4
tests/                    node:test files, one per core module
```

**State.** One store holds:

```js
{
  mode: "explore" | "compare",
  cycle: "otto" | "diesel" | "dual",
  shared: { T1, P1, k },
  params: { otto: { r, qin }, diesel: { r, rc }, dual: { r, rp, rc } },
  compare: { constraint, shared: { r, qin, Pmax }, a: { type, xv, params }, b: { type, xv, params } },
  options: { strokes, shade, logAxes, pauseAtStates, showNumbers, focus, theme },
  playback: { playing, speed, slot, tau },
  card: "intro" | "<processId>" | "summary"
}
```

The playhead is stored as `slot` and `tau`; the phase is derived from the current timeline.

**Model.** `buildModel(state)` is pure and lives in `core/` so it is tested. It returns a list
of cycles, each `{ id, label, solution, timeline, samples }`, plus the axis bounds for both
diagrams. In explore mode the list has one cycle; in compare mode two, with each timeline
built with the other's slots forced so both share one phase. **Write every view against the
list from M2 on**, so compare mode is an addition and not a rewrite.

**Views.** Each view is a factory `createXView(container, deps)` returning
`{ render(model, state), tick(frames, state) }`. `render` runs when parameters or options
change and may rebuild DOM. `tick` runs on every animation frame and every scrub, receives one
frame per cycle from `frameAt`, and only updates attributes and text of elements that already
exist. No layout reads in `tick`.

**Clock.** `main.js` owns the only `requestAnimationFrame` loop. It advances the phase, stops at
slot boundaries when "Pause at each state" is on, computes the frames once and passes them to
every view.

---

## M1 Core model

**Goal:** the complete model as tested, DOM-free JavaScript. No page yet.

**Read:** PHYSICS.md, all of it.

**Build**

- `site/js/core/`: `gas.js`, `cycle.js`, `paths.js`, `kinematics.js`, `timeline.js`,
  `compare.js`, `format.js`, with the exports in PHYSICS.md section 9.
- `tests/helpers.js`: load the fixture, `assertClose(actual, expected, label)` with the
  tolerance from PHYSICS.md section 10, and a deep comparison for nested objects.
- One test file per module. Reproduce every number in every section of the fixture, then add
  the nine required test groups from PHYSICS.md section 10.

**Done when**

- `npm test` passes, and the fixture file is unchanged (`git diff --stat tests/fixtures` is
  empty).
- Every fixture section is exercised: cycles (states, processes, metrics, midpoints),
  efficiency, kinematics, timelines (slots, statePhases, every frame), compare.
- Nothing in `core/` touches `window`, `document` or the DOM.

**Commit:** `Add core cycle model with tests`

---

## M2 First light: engine, P–v diagram, transport

**Goal:** open the page, press play, and watch the piston and the P–v state point move together
for all three cycles at their default settings. This is the heart of the tool; make it look
good.

**Read:** SPEC sections 3–7 and 16. PHYSICS sections 5 and 6.

**Build**

- `index.html`, `css/tokens.css` (all tokens from SPEC section 16, light theme only for now),
  `css/app.css` (the desktop grid from SPEC section 4; empty placeholders for panels that come
  later).
- `state/store.js`, `state/defaults.js`, `core/model.js`, `core/scale.js` (with tests for nice
  bounds and ticks), `main.js`.
- Header with the cycle selector (Otto, Diesel, dual). No Explore/Compare switch yet.
- `ui/engineView.js`: everything in SPEC section 5 except the valves opening.
- `ui/diagramView.js`, used for P–v only in this milestone: axes with nice bounds, grid, the
  cycle curve colored by role with direction arrows, state markers and labels, the state point
  with drop-lines and axis values, the trail.
- `ui/transport.js`: buttons, speed, the timeline bar with click and drag to scrub, the "Pause
  at each state" switch, and the keyboard shortcuts from SPEC section 7 (except F).

**Check in the browser** (1366 × 768)

- Otto: during 1→2 the piston rises while the point climbs the compression curve to the left.
  During 2→3 the piston is still at TDC, the spark flashes, the `q_in` arrow shows, the gas
  color heats up and the point rises vertically. During 3→4 the piston descends with a `w_out`
  arrow. During 4→1 the piston is still at BDC and the `q_out` arrow shows.
- Diesel: during 2→3 the piston moves down slowly while the point moves right along a
  horizontal line, with `q_in` and `w_out` both showing.
- Dual: five segments in the timeline bar; the point goes up, then right, at the top.
- Readout at state 2 of the default Otto cycle: P ≈ 1838 kPa, T ≈ 689.2 K. At state 3:
  4811 kPa, 1804.2 K. Default Diesel at state 3: 5720 kPa, 1906.6 K.
- Switching Otto → Diesel visibly lowers the cylinder head (r goes from 8 to 18).
- Scrubbing the timeline bar moves the piston and the point together, in both directions.
- Stage and transport bar fit the viewport without scrolling. No console errors.

**Commit:** `Add page shell, engine view, P-v diagram and transport`

---

## M3 Interactivity: parameters, results, T–s, dragging, state table

**Goal:** a student can change every parameter and see the consequences everywhere at once.

**Read:** SPEC sections 6, 8, 9, 11. PHYSICS section 11.

**Build**

- `ui/paramsPanel.js` and `ui/resultsPanel.js` per SPEC sections 8 and 9.
- The T–s diagram: a second instance of the diagram view.
- On both diagrams: dragging the state point, hover tooltips, and the axis behavior from SPEC
  section 6 (fixed while a slider moves inside a band, animated rescale across bands).
- On P–v: the piston strip under the v axis, and the log-axes switch.
- `ui/stateTable.js` per SPEC section 11.

**Check in the browser**

- Drag the Otto `r` slider from 6 to 12: the cylinder head moves down, the curve gets taller
  inside fixed axes and then the axes rescale smoothly, efficiency rises from 51.2 % to 63.0 %.
- Change Otto `q_in` from 800 to 1200: the cycle gets taller, `w_net` grows, efficiency stays
  at 56.5 %.
- Diesel: raise `r_c` from 2 to 3 at r = 18: efficiency falls from 63.2 % to 58.9 %.
- Type `18` and `2` into the Diesel number boxes: accepted exactly.
- Set k to 1.667 with the chip: the Otto efficiency at r = 8 becomes 75.0 %.
- Drag the point on the T–s diagram: the piston and the P–v point follow, and playback pauses.
- On T–s the isentropes are vertical; in the dual cycle the constant-volume part is steeper
  than the constant-pressure part.
- Piston strip: the drop-line from the P–v point lands on the piston face throughout the cycle.
- Log axes: the two isentropes are straight and parallel.
- While paused mid-compression, changing `r` keeps the piston where it is.
- The state table matches PHYSICS.md's reference table for the three default cycles.

**Commit:** `Add parameters, results, T-s diagram, dragging and state table`

---

## M4 Guided step-through and equations

**Goal:** a student working alone can step through a cycle one process at a time and read what
happens, with the equations and their numbers.

**Read:** SPEC section 10. `site/js/content/content.js` (the header comment explains its
conventions).

**Build**

- Vendor KaTeX: in a temporary directory run `npm pack katex@0.16` (the latest 0.16.x), unpack
  it, and copy `dist/katex.mjs`, `dist/katex.min.css`, `dist/fonts/*.woff2` and `LICENSE` to
  `site/vendor/katex/`. Record the exact version in `site/vendor/katex/VERSION`. Nothing is
  added to `package.json`.
- `ui/math.js`: `renderMath(el, tex, {display})`, and a helper that renders prose containing
  `$…$`. If KaTeX fails to load, show the raw TeX rather than nothing.
- `core/values.js` (pure, tested): builds the `\val{…}` map from a solution using
  `core/format.js`. The list of names is in the header of `content.js`.
- `ui/processCard.js` and the guided-tour behavior in SPEC section 10.
- The "Symbols" and "Model" dialogs (native `<dialog>`).
- `tests/katex.test.js`: render every `tex`, every `num` (after `\val` substitution for each of
  the three default cycles) and every inline `$…$` in `content.js` with
  `katex.renderToString(…, {throwOnError: true})`.

If KaTeX rejects a string in `content.js`, fix the TeX syntax with the smallest change that
keeps the meaning, and list the change in your report. Do not reword the prose.

**Check in the browser**

- Guided tour on Otto: intro, then Next four times plays one process each and stops at states
  2, 3, 4, 1 with the matching card; Next again shows the summary. Back works.
- Card for Otto 1→2 shows `T₂ = (300)(8)^0.4 = 689.2 K`, and updates when `r` changes.
- Free play: the card changes as the playhead crosses each state.
- Diesel 2→3 card shows three equations including the work during heat addition, 273.6 kJ/kg.
- Dual shows cards for 2→x and x→3. With `r_c = 1` the x→3 step disappears.
- Equations are typeset (fractions, subscripts), not raw TeX. Math fonts load from
  `vendor/katex/fonts` with no 404s and no request leaves localhost.

**Commit:** `Add guided step-through with typeset equations`

---

## M5 Energy bookkeeping, area shading, intake and exhaust strokes

**Goal:** the first law made visible, and the link from the ideal cycle to a real four-stroke
engine.

**Read:** SPEC sections 6 (area shading), 12 and 14. PHYSICS section 8.

**Build**

- `ui/energyView.js` per SPEC section 12.
- Area shading on both diagrams and its switch.
- The strokes switch: slots X and I in the timeline, valves opening in the engine view, the P₁
  line and state 0 on P–v, the stroke cards, the stroke rows in the energy panel.

**Check in the browser**

- Default Otto, energy panel after one full pass: 1→2 `w_in` 279.3, 2→3 `q_in` 800.0, 3→4
  `w_out` 731.0, 4→1 `q_out` 348.2; totals `w_net` 451.8; ΣΔu = 0; summary bar split 56.5 %.
- Default Diesel 2→3 row shows `q_in` 957.6, `w_out` 273.6 and Δu 684.0 at once.
- Bars for the current process grow while it plays and reset at state 1.
- P–v shading: the area under 1→2 fills as the piston rises; the loop is labeled `w_net`.
- T–s shading: the area under 2→3 fills during heat addition.
- Strokes on: after 4→1 the exhaust valve opens and the piston pushes the gas out; then the
  intake valve opens. The P–v point runs left and back along P₁; the T–s point does not move.
  The two stroke rows show 75.3 kJ/kg each (default Otto) and are marked as canceling.
- Strokes off again: everything returns to the four-process cycle.

**Commit:** `Add energy bookkeeping, area shading and optional strokes`

---

## M6 Efficiency curves and compare mode

**Goal:** see how efficiency depends on the design, and put two cycles side by side.

**Read:** SPEC sections 13 and 15. PHYSICS section 7.

**Build**

- `ui/efficiencyView.js` per SPEC section 13.
- The Explore/Compare switch, `ui/compareView.js` (controls, results table, takeaway), the two
  overlaid cycles on both diagrams, the two engines on a shared timeline.
- Extend `core/model.js` for compare mode, with tests: both timelines have identical slot
  boundaries; a cycle waits (`waiting = true`) through a slot only the other has.

**Check in the browser**

- Efficiency chart, Otto: the marker sits at r = 8, η = 56.5 % and slides along the curve as
  `r` changes; reference curves for k = 1.3 and 1.667 are labeled at their ends.
- Efficiency chart, Diesel: curves for r_c = 1, 2, 3, 4, ordered top to bottom.
- Compare, default (Otto versus Diesel, same r = 12 and q_in = 1000): efficiencies 63.0 % and
  55.4 %, Otto marked as better. On P–v both cycles share the compression curve.
- Switch to "Peak pressure and heat input" at 7000 kPa: Otto r = 9.81, 59.9 %; Diesel
  r = 20.79, 65.3 %. Both curves top out at the same pressure. The two engines show different
  clearance heights.
- Play in compare mode: during heat addition the Otto piston stays at TDC, then shows
  "waiting", while the Diesel piston waits first and then moves down. Both reach BDC together.
- Dual as side B with the heat-split slider at 0.5 and same r and q_in: 61.8 %.
- Back to Explore: the single-cycle views are intact.

**Commit:** `Add efficiency curves and compare mode`

---

## M7 Polish and publish

**Goal:** ready for students, and live on GitHub Pages.

**Read:** SPEC sections 4, 16 and 17.

**Part A, polish**

- Responsive layouts for 700–1099 px and below 700 px (SPEC section 4). Check at 390 × 844 and
  820 × 1180.
- Focus view and the F key.
- Dark theme from the tokens, following the OS setting, with a header toggle that wins both
  ways.
- `prefers-reduced-motion`, ARIA labels, focus rings, tap-target sizes (SPEC sections 16, 17).
- Page title, meta description, an inline SVG favicon, a footer line: the model in one sentence
  and "Notation follows Çengel & Boles, *Thermodynamics: An Engineering Approach*."
- Complete `README.md`: what it is, a screenshot, how to run and test locally, the model's
  assumptions, how to edit the teaching text.
- Go through every "Check in the browser" list of M2–M6 once more at 1366 × 768.
- Optional, only if all of the above is done and verified: gas molecules. About 80 dots in the
  gas, positions stored as fractions of the gas column so compression squeezes them together,
  jitter speed proportional to √T, count scaled by `massFraction` during the strokes, off under
  reduced motion, behind a "Show molecules" switch.

**Part B, publish.** This makes the site public. **Ask the instructor before each of the first
two steps and wait for a yes.**

1. Make the repository public: `gh repo edit johnboerchers/ic-cycles --visibility public
   --accept-visibility-change-consequences`.
2. Enable Pages with GitHub Actions as the source:
   `gh api -X POST repos/johnboerchers/ic-cycles/pages -f build_type=workflow`.
3. Add `.github/workflows/pages.yml`: on push to `main`, run `npm test`, then publish the
   `site/` folder with `actions/configure-pages`, `actions/upload-pages-artifact`
   (`path: site`) and `actions/deploy-pages`, with `pages: write` and `id-token: write`
   permissions. Look up the current major versions of those actions rather than guessing.
4. Push, watch the run, and open https://johnboerchers.github.io/ic-cycles/. Every asset path
   in the site must be relative (no leading `/`), because the site is served from a subfolder.
5. Add the live URL to the README and to the repository's "About" box.

From this point a push to `main` goes straight to students: see CLAUDE.md, "Git".

**Commit:** `Polish, responsive layout and accessibility`, then `Deploy to GitHub Pages`

---

## Notes between sessions

Newest first. Keep each entry short.

- **M3 (interactivity).** Checked at 1366 × 768 in the browser: every item of the list, numbers
  exact. New core modules, all tested: `pick.js` (dragging, hover), `tables.js` (state table,
  results, q/w as magnitudes with in/out), `params.js` (number-box parsing); log scale and ticks in
  `scale.js`; `pvLog` bounds and `phaseSamples` in `model.js`.
- Readings chosen: log axes use 1.25 headroom, not 1.05 (1.05 is ~2 % of a log axis and put the dual
  cycle's top against the frame). "Reset" restores the current cycle's parameters and T₁, P₁, k.
  Number boxes apply a value only when complete and in range; Enter or leaving the box clamps.
- The 250 ms axis rescale runs its own short `requestAnimationFrame` inside `diagramView.js`; the
  playback clock in `main.js` is still the only loop that moves the playhead. Ticks during the
  rescale come from the target bounds, so labels never show odd values.
- Piston strip and its drop-line are drawn for the first cycle only; compare mode (M6) must decide
  what the strip shows for two cycles. With the strip, the P–v plot loses 44 px of height.
- Rough edge: on linear P–v the P badge still covers state label 2 when the dot is at the top of a
  Diesel or dual cycle (noted in M2); the tooltip hit radius on state markers is 10 px.

- **M2 (first light).** Checked at 1366 × 768: all items of the list, readouts exact. Stage is 62vh
  (SPEC says about half); header + stage + transport end at y ≈ 600. Engine text is laid out in
  pixels beside a scaled geometry group, so labels stay 11–14 px at any size.
- Additions to core, all tested: `formatTicks` in `format.js`; `segmentedScale` and `colorRamp` in
  `scale.js`; playback helpers (`nextBoundary`, `previousStart`, `advancePhase`, `timelineSegments`,
  `labeledStates`) in `model.js`. Gas ramp colors are read from the `--gas-*` tokens in render.
- Readings chosen: "Next" (→) plays to the next state and stops, each extra press while playing
  adds one process; "Previous" (←) jumps back without animating; Home keeps the play state;
  scrubbing pauses; hiding the tab pauses. Work arrow is blue for w_in and green for w_out (the
  energy flow, not the process), so Diesel 2→3 shows an orange q_in and a green w_out together.
- Rough edges: on linear P–v the Diesel/dual top sits ~25 px from the P axis, so label "2" can touch
  the P badge (log axes in M3 help); the 4→1 arrowhead is skipped where the curve is < 36 px long.
  Buttons do not take focus on mouse click, so Space keeps meaning play after clicking them.

- **M1 (core model).** `npm test`: 48 tests, every fixture section reproduced at 1e-9; regenerating
  the fixture gives a byte-identical file. `format.js` exposes `formatValue(quantity, x)` and
  `formatTex(quantity, x)`; quantities are T P v s q w u mep eta ratio k cv cp.
- `frameAt` fields not in the fixture (`role`, `heatIn`, `heatOut`, `workSign`, `valves`) have
  their own tests. While waiting in a forced slot, `role` is that of the process it waits at the
  end of (as `processId` in the fixture) and `workSign` is 0.
- Slots X and I have `processId: null` in the timeline (as in the fixture); frames use `1-0`/`0-1`.
- `sideRatios` takes xv from the type for Otto (1) and Diesel (0), ignoring `side.xv`. `eta` is
  NaN whenever no heat addition is non-degenerate, since rounding can leave qin a hair above 0.
- PHYSICS section 11's s example `0.6906` matches no default cycle (default Otto s3 = 0.6905);
  read as an illustration of the format only.

- **M0 (setup).** The fixture, `tools/reference_cycles.py`, `site/js/content/content.js` and
  `tests/content.test.js` exist and `npm test` passes (7 tests). The equations in `content.js`
  have been checked for balanced braces and known `\val` names but have not yet been rendered
  by KaTeX; that happens in M4. The project is MIT-licensed (`LICENSE`).
