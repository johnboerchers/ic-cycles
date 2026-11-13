# Product spec

What to build. The thermodynamics and the animation model are in [PHYSICS.md](PHYSICS.md); the
order of work is in [BUILD_PLAN.md](BUILD_PLAN.md).

## 1. Purpose

A single web page that teaches the ideal Otto, Diesel and dual cycles to undergraduate
thermodynamics students. Its core idea: an animated piston–cylinder and the state point on the
P–v and T–s diagrams move together, so a student sees isentropic compression as the piston
rising *and* as the point climbing the isentrope, at the same moment.

Two ways it is used, and both must work well:

- **In lecture**, projected, driven by the instructor. Needs large clean visuals, little text,
  keyboard control.
- **Self-study**, on a laptop (and usably on a phone). Needs explanations of each process and
  the equations with numbers.

## 2. Decisions already made by the instructor

Do not reopen these.

| Topic | Decision |
|---|---|
| Cycles | Otto, Diesel, dual |
| Model | Cold-air-standard, constant specific heats, adjustable k |
| Notation | Çengel & Boles: P, v, T, s, k, r, r_c, MEP; dual cycle states 1-2-x-3-4 |
| Units | SI only: kPa, K, m³/kg, kJ/kg |
| Engine view | The ideal closed cycle by default; a switch adds intake and exhaust strokes |
| Displays | P–v, T–s, state table, results, energy bookkeeping, efficiency curves |
| Learning features | Guided step-through with equations; compare two cycles |
| Not wanted (for now) | Quiz questions, presets, shareable links, English units, variable specific heats |

## 3. Notation on screen

- Variables are italic, as in the textbook: *P*, *v*, *T*, *s*, *k*, *r*. Subscripts: *r*<sub>c</sub>,
  *r*<sub>p</sub>, *q*<sub>in</sub>, *q*<sub>out</sub>, *w*<sub>net</sub>, *η*<sub>th</sub>. MEP is upright.
- Uppercase P, lowercase v. Always "P–v" and "T–s" with an en dash.
- Heat and work are shown as magnitudes with direction subscripts (*q*<sub>in</sub>, *w*<sub>out</sub>),
  never as signed numbers.
- Entropy is shown as *s* − *s*<sub>1</sub>.
- Process names: "isentropic compression", "constant-volume heat addition", "constant-pressure
  heat addition", "isentropic expansion", "constant-volume heat rejection". TDC and BDC for the
  dead centers.
- Sentence case for all headings, labels and buttons.

## 4. Page layout

Desktop and projector (viewport ≥ 1100 px wide). Everything down to the transport bar must fit
in a 1366 × 768 viewport without scrolling.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Engine cycles   [Otto|Diesel|Dual]   [Explore|Compare]    Symbols · Model · Focus │
├────────────────┬─────────────────────────────┬────────────────────────────┤
│                │                             │                            │
│  Engine        │   P–v diagram               │   T–s diagram              │
│                │                             │                            │
├────────────────┴─────────────────────────────┴────────────────────────────┤
│ ⏮  ◀  ▶  ▶|   speed   [1→2 │ 2→3 │ 3→4 │ 4→1]────●────   options          │
├──────────────────────────┬────────────────────┬───────────────────────────┤
│ Process card             │ Parameters         │ Results                   │
├──────────────────────────┴────────────────────┴───────────────────────────┤
│ States                   │ Energy             │ Efficiency                │
└───────────────────────────────────────────────────────────────────────────┘
```

- The stage row (engine, P–v, T–s) is about 22 % / 39 % / 39 % wide and takes roughly half the
  viewport height.
- **Focus view** (button, and the `F` key): hides everything below the transport bar, lets the
  stage fill the viewport and scales text up about 25 %. This is the lecture mode.
- 700–1099 px: engine and P–v on the first row, T–s on the second, panels below in two columns.
- Below 700 px: engine (about one third of the width) and P–v side by side in a block that
  sticks to the top; T–s under it; the transport bar sticks to the bottom; panels stack. The
  piston and the P–v point must always be visible together.

## 5. Engine view

A flat 2D cross-section, schematic rather than realistic, drawn in SVG. Gas at the top, crank
at the bottom.

Suggested geometry in a `260 × 480` viewBox (adjust for looks, keep the relationships):

- Bore: inner width 120. Stroke `S = 130`, so crank radius `a = 65` and rod length `l = 195`
  (ρ = 3). Piston crown at `y = 120` at TDC and `y = 250` at BDC: `yCrown = 120 + xhat·130`.
- **Clearance to scale:** the gas column height is `hc + xhat·S` with `hc = S/(r − 1)`, clamped
  to `[4, 60]`. The piston travel and crank never change; when `r` changes, the cylinder head
  moves. Raising the compression ratio visibly shrinks the clearance volume.
- Rod and crank come from the kinematics in PHYSICS.md section 5 so the parts stay connected.
- Dashed lines across the bore at TDC and BDC, labeled "TDC" and "BDC".

What it shows:

| Element | Behavior |
|---|---|
| Gas | Fills the space between head and piston. Color is temperature on a fixed scale (section 16), so a hotter cycle looks hotter. Label "air" |
| Thermometer | A vertical bar beside the cylinder showing the temperature scale, with a pointer at the current T. It is the legend for the gas color |
| Head hardware | Otto: spark plug, with a spark flash at the start of heat addition. Diesel and dual: fuel injector, with a spray cone during heat addition |
| Heat arrows | `q_in` arrow pointing into the gas, visible with opacity `frame.heatIn`; `q_out` arrow pointing out, opacity `frame.heatOut`. A soft glow in the gas during heat addition |
| Work arrow | Beside the piston: pointing up and labeled `w_in` when `workSign = −1`, down and labeled `w_out` when `+1`, hidden at 0 |
| Valves | Intake (left) and exhaust (right) in the head. Closed for the whole ideal cycle. They open by `frame.valves` only during the optional strokes |
| Live readout | P, T and v of the gas as numbers under the engine |
| Waiting | In compare mode, a small "waiting" tag while `frame.waiting` |

A caption under the engine names what the picture models: "Air–fuel mixture, modeled as air"
for Otto, "Air only; fuel injection is modeled as heat addition" for Diesel and dual.

## 6. Diagrams

One diagram component, used twice: P–v (x = v, y = P) and T–s (x = s − s₁, y = T). Render at
the container's pixel size (a `ResizeObserver` sets the viewBox) so text stays a real 12–14 px.

- **Axes.** Both start at 0 on P–v; on T–s, T starts at 0 and s starts slightly left of 0. Upper
  bounds are "nice" numbers from the series 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10 × 10ⁿ applied
  to 1.05 × the maximum. The point: while a slider moves within a band the axes stay fixed and
  the curve visibly grows or shrinks; when it crosses a band the axes rescale with a 250 ms
  transition. About five ticks per axis, hairline grid, labels such as "*v* (m³/kg)".
- **Cycle curve.** One path per process, in its role color, 2.5 px. An arrowhead at the middle
  of each process shows the direction. Degenerate processes are not drawn.
- **States.** Hollow 8 px markers with the labels 1, 2, x, 3, 4 in ink, offset away from the
  curve. No label for a state that coincides with another (x in Otto and Diesel).
- **State point.** A 12 px filled dot with a 2 px surface-color ring, plus dashed drop-lines to
  both axes with the current value written at each axis.
- **Trail.** The part of the current process already covered is drawn 2 px thicker.
- **Area shading** (switch "Shade work and heat", on by default, linear axes only). The enclosed
  loop is tinted (ink at 6 % opacity) and labeled *w*<sub>net</sub> on P–v and
  *q*<sub>net</sub> = *w*<sub>net</sub> on T–s. During a process, the area under its curve from
  its start to the dot, down to the axis, fills in the role color at 18 % opacity: that is the
  work so far on P–v and the heat so far on T–s. This is why both vertical axes start at 0.
- **Piston strip** (P–v only, linear axes only). Under the v axis, on the same x scale, a thin
  horizontal cylinder from v = 0 to v₁: gas from 0 to the current v in the gas color, a piston
  block at v, ticks at v₂ "TDC" and v₁ "BDC". The dot's drop-line lands on the piston face. This
  makes "x position on the diagram = piston position" literal.
- **Log axes** (switch on the P–v diagram, off by default). Log–log scales, on which every
  isentrope is a straight line of slope −k. Shading and the piston strip are hidden in this mode.
- **Dragging.** Pointer down on or near the curve, then drag: the phase jumps to the nearest
  point of the cycle and follows the pointer; the engine and the other diagram follow. Sample
  about 600 phases, pick the nearest in screen space, refine between neighbors. Use pointer
  events with pointer capture and `touch-action: none` on the plot area. Dragging pauses
  playback.
- **Hover.** A state marker shows a tooltip with P, T, v, s. A process curve shows its name and
  its q and w.
- **Strokes.** When the intake and exhaust strokes are on, P–v gains a dashed neutral line at
  P₁ from v₂ to v₁ with a state label 0 at the left end.

## 7. Transport and timeline

- Buttons: restart (to state 1), previous process, play/pause, next process.
- Speed: 0.25×, 0.5×, 1×, 2×.
- **Timeline bar:** one segment per non-empty slot, width proportional to its duration, filled
  in the role color, labeled "1→2", "2→3" and so on, with a 2 px gap between segments and a
  playhead. Click or drag to scrub. This is also the progress indicator.
- **Pause at each state** (switch): playback stops at every slot boundary. "Next process" plays
  one process and stops.
- Switches: "Show intake and exhaust strokes", "Shade work and heat".
- The page loads paused at state 1 with the play button emphasized. It never autoplays.
- Playback uses `requestAnimationFrame`; clamp the time step to 100 ms and pause when the tab is
  hidden.

Keyboard, active only when focus is not in a form control: Space play/pause, ← → previous/next
process, Home restart, 1 2 3 choose Otto/Diesel/dual, F focus view.

## 8. Parameters

Each control is a slider paired with a number box (type exact values to match a homework
problem). Changing a value updates everything immediately; the playhead keeps its slot and τ.

| Parameter | Shown for | Range | Step | Default |
|---|---|---|---|---|
| Compression ratio *r* | Otto | 4–16 | 0.5 | 8 |
| | Diesel | 8–26 | 0.5 | 18 |
| | Dual | 8–26 | 0.5 | 16 |
| Heat added *q*<sub>in</sub> (kJ/kg) | Otto | 200–2000 | 10 | 800 |
| Cutoff ratio *r*<sub>c</sub> | Diesel | 1.1–4 | 0.05 | 2 |
| | Dual | 1–3 | 0.05 | 1.5 |
| Pressure ratio *r*<sub>p</sub> | Dual | 1–3 | 0.05 | 1.5 |
| Inlet temperature *T*<sub>1</sub> (K) | all | 250–400 | 1 | 300 |
| Inlet pressure *P*<sub>1</sub> (kPa) | all | 50–200 | 1 | 100 |
| Specific heat ratio *k* | all | 1.2–1.67 | 0.01 | 1.4 |

- Each cycle type remembers its own *r* and heat parameters. *T*<sub>1</sub>, *P*<sub>1</sub>
  and *k* are shared.
- Quick-set chips for *k*: 1.3, 1.4 (air), 1.667 (monatomic gas).
- A "Reset" button restores the defaults of the current cycle.
- Dual with *r*<sub>p</sub> = *r*<sub>c</sub> = 1 has no heat addition: show "—" for the
  results and the hint "Add heat: raise *r*<sub>p</sub> or *r*<sub>c</sub>."
- Number boxes clamp to the range on blur, and ignore incomplete input while typing.

## 9. Results

Stat tiles, always visible: *η*<sub>th</sub>, *w*<sub>net</sub>, *q*<sub>in</sub>,
*q*<sub>out</sub>, MEP, *T*<sub>max</sub>, *P*<sub>max</sub>. Efficiency is the largest. Under
it, in muted text, the Carnot efficiency between *T*<sub>max</sub> and *T*<sub>1</sub> for
reference. For Otto also show the derived *r*<sub>p</sub>; for Diesel and dual the heat split is
visible in the energy panel.

## 10. Process card (guided step-through)

All wording and equations come from `site/js/content/content.js`. Wire it in; do not rewrite or
paraphrase it. Render math with KaTeX (vendored under `site/vendor/katex`).

The card shows, for one step: the title with its role color chip and state numbers; `what`;
`engine` (labeled "In the engine"); four trend indicators for P, T, v, s (↑ ↓ or "const");
`energy`; the equations; and `notice` (labeled "Notice").

- Each equation appears in symbolic form, with its numeric form beneath (`num`, with `\val{…}`
  replaced by current values formatted per PHYSICS.md section 11). A "Show numbers" switch, on
  by default, hides the numeric lines. Prose can contain inline math between `$…$` and
  `\val{…}` too.
- Steps for a cycle: intro (state 1), one per non-degenerate process, summary. Step dots across
  the top of the card; Back and Next buttons; "Replay" replays the current process.
- **Free play:** the card follows the playhead and shows the current process. Before the first
  play it shows the intro.
- **Guided:** a "Guided tour" button rewinds to state 1, turns on "Pause at each state" and
  shows the intro. Next plays the next process and stops at its end, with that process's card
  showing. After the last process, Next shows the summary. Back shows the previous card and puts
  the playhead at the end of that process.
- With the strokes on, the two stroke cards (`CONTENT.strokes`) join the sequence after 4→1.

Header buttons open two small dialogs: "Symbols" (`CONTENT.symbols`) and "Model"
(`CONTENT.model`: assumptions and caveats).

## 11. State table

Rows for states 1, 2, x, 3, 4 (only the distinct ones) plus a live row for the moving point.
Columns: P (kPa), T (K), v (m³/kg), u − u₁ (kJ/kg), s − s₁ (kJ/kg·K). The two rows at the ends
of the current process are highlighted. Tabular figures, right-aligned.

## 12. Energy bookkeeping

Shows the first law at work, per process and for the cycle.

- One row per process, with a role color chip and its label. Three bar cells per row: heat
  (labeled *q*<sub>in</sub> or *q*<sub>out</sub> with its magnitude, or "0"), work
  (*w*<sub>in</sub> or *w*<sub>out</sub>), and Δu (signed, bars diverging left and right of a
  zero line). All bars share one scale. Bars take the row's role color.
- The current row animates from `frame.energy`. Rows already completed in this pass are full;
  rows not yet reached are outlined. Everything resets at state 1.
- A totals row: *q*<sub>in</sub> − *q*<sub>out</sub> = *w*<sub>net</sub>, and ΣΔu = 0.
- A summary bar under the table: its full length is *q*<sub>in</sub>, split into
  *w*<sub>net</sub> and *q*<sub>out</sub>, with *η*<sub>th</sub> = *w*<sub>net</sub>/*q*<sub>in</sub>
  written on it. This is the efficiency as a picture.
- With the strokes on, two more rows show the exhaust and intake work and a note that they
  cancel.

## 13. Efficiency curves

*η*<sub>th</sub> against compression ratio, r from 2 to 26, η from 0 to 100 %.

- The curve for the current settings is drawn bold in the primary color, with a marker at the
  current *r* and a label giving the value.
- Thin gray reference curves, each labeled directly at its right end (no legend box):
  - Otto: *k* = 1.3 and *k* = 1.667.
  - Diesel: *r*<sub>c</sub> = 1 (the Otto limit), 2, 3 and 4.
  - Dual: the Otto curve, and the Diesel curve with the same *r*<sub>c</sub>.
- Light bands marking typical real ranges: "gasoline engines" r ≈ 8–12, "diesel engines"
  r ≈ 14–22. Keep these numbers in one place so the instructor can change them.
- Hover shows a crosshair with r and η. Dragging the marker changes *r*.

## 14. Intake and exhaust strokes

Off by default. When on, the exhaust and intake strokes follow heat rejection (PHYSICS.md
section 8): the valves open, the gas amount changes, the P–v point runs along the P₁ line and
back, and the T–s point stays on state 1. The process card, timeline bar and energy panel gain
the two strokes. While the strokes are on, show `CONTENT.strokes.note` under the P–v diagram
(it explains what the horizontal axis means for an open cylinder). The switch is hidden in
compare mode.

## 15. Compare mode

Overlays two cycles, A and B, that share state 1 and *k*.

- **Controls.** A type selector for each side (any of the three, the same type twice is
  allowed). "Hold equal": "Compression ratio and heat input" (default), "Peak pressure and heat
  input", "Nothing". Sliders appear for whatever is free: the shared quantities (*r* and
  *q*<sub>in</sub>, or *P*<sub>max</sub> and *q*<sub>in</sub>), a heat-split slider for a dual
  side ("fraction of heat at constant volume", default 0.5), or each side's own parameters when
  nothing is held equal.
- **Defaults:** A Otto, B Diesel, *r* = 12, *q*<sub>in</sub> = 1000 kJ/kg, *P*<sub>max</sub> =
  7000 kPa. Ranges: *r* 8–20, *q*<sub>in</sub> 400–1200, *P*<sub>max</sub> 4000–12000.
- **Diagrams.** Both cycles on the same axes. Here color means the cycle, not the process:
  A solid in color A, B dashed in color B, each with its own dot and state labels. The piston
  strip and the area shading are hidden in compare mode (two overlapping loops make both
  unreadable); the log-axes switch stays.
- **Engines.** Two engines side by side in the engine panel, labeled A and B, animated on one
  shared timeline (PHYSICS.md section 6, forced slots). During heat addition the difference
  between the cycles is visible directly: one piston holds still while the other moves.
- **Lower panels** are replaced by: a side-by-side results table (type, r, r_p, r_c,
  q_in, q_out, w_net, η_th, MEP, T_max, P_max) with the better efficiency marked; the takeaway
  text from `CONTENT.compare`; and the efficiency chart with both markers.
- If a constraint cannot be met (`sideRatios` returns `null`), say so in place of the results.

## 16. Visual design

Quiet, flat, textbook-like. System sans-serif for the interface, KaTeX for math. Light theme is
primary (projectors); a dark theme follows the OS setting and a header toggle.

Define everything as CSS custom properties in `css/tokens.css` and use the role names in code.

| Token | Light | Dark |
|---|---|---|
| Page | `#f9f9f7` | `#0d0d0d` |
| Panel surface | `#fcfcfb` | `#1a1a19` |
| Ink | `#0b0b0b` | `#f0efec` |
| Secondary ink | `#52514e` | `#c3c2b7` |
| Muted (axis labels) | `#898781` | `#898781` |
| Grid hairline | `#e1e0d9` | `#2c2c2a` |
| Axis line | `#c3c2b7` | `#383835` |
| Border | `rgba(11,11,11,0.10)` | `rgba(255,255,255,0.10)` |
| Compression | `#2a78d6` | `#3987e5` |
| Heat addition (both kinds) | `#eb6834` | `#d95926` |
| Expansion | `#1baf7a` | `#199e70` |
| Heat rejection | `#eda100` | `#c98500` |
| Intake and exhaust | muted ink, dashed | same |
| Compare A / B | `#2a78d6` solid / `#eb6834` dashed | `#3987e5` / `#d95926` |

The scheme is readable as: **cool colors for the isentropic processes, warm colors for heat
transfer.** These four colors were checked as a closed loop for color-vision-deficiency
separation and contrast in both themes. Do not substitute other hues without re-running that
check. Two of them are below 3:1 contrast on the light surface, so never rely on color alone:
every process also carries its label and state numbers.

Rules:

- Text is always in an ink token, never in a role color. Put a colored chip or mark next to it.
- The two heat-addition processes of the dual cycle share a color; the state x marker, the
  labels and the 2 px gap in the timeline tell them apart.
- Gas temperature is a one-hue ramp on a fixed scale, clamped at both ends and interpolated
  between these stops:

  | T (K) | 250 | 600 | 1000 | 1400 | 1800 | 2300 | 2800 |
  |---|---|---|---|---|---|---|---|
  | Light | `#feece5` | `#fed3c4` | `#feb59b` | `#ff9068` | `#f26e3b` | `#d44f0f` | `#a83900` |
  | Dark | `#3b2922` | `#5a3021` | `#7c3a20` | `#a4451f` | `#cb521f` | `#ee6b37` | `#fe936c` |

- Panels: surface color, hairline border, 8 px radius, no shadows. Spacing on a 4 px grid.
- Numbers in tables and readouts use `font-variant-numeric: tabular-nums`.
- Motion is functional only. Under `prefers-reduced-motion`, drop decorative effects (glow,
  spark, transitions); the piston and the state point still move when the user presses play.

## 17. Accessibility

- All controls are native elements (`button`, `input type="range"`, `input type="number"`,
  `select`) with visible labels and visible focus rings.
- Every SVG view has a `<title>` and a one-sentence `aria-label` describing the current state
  (for example "Otto cycle, process 1 to 2, isentropic compression, 40 % complete"), updated at
  most twice a second.
- The state table is a real `<table>`; it is the text alternative to the diagrams.
- Tap targets at least 40 px on touch screens.

## 18. Out of scope

Variable specific heats, English units, quiz questions, presets, shareable URLs, saving state,
Atkinson and Miller cycles, real-engine effects (friction, heat loss, valve timing), sound,
analytics, any server.
