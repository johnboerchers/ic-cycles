# IC cycles

An interactive explorer for the ideal Otto, Diesel and dual cycles, made for undergraduate
thermodynamics courses. An animated piston–cylinder moves in step with the state point on the
P–v and T–s diagrams, so each process can be watched as a piston motion and as a path on the
diagram at the same time.

![The Diesel cycle during constant-pressure heat addition: the piston moving down with heat
added and work out, the state point on the P–v and T–s diagrams, the area under the T–s curve
shaded as heat, and the process card below.](docs/images/screenshot.png)

**Status:** complete apart from publishing. The site is not public yet.

## What you can do with it

- **Watch a cycle.** Press play (or Space) and follow the piston, the gas color, the heat and
  work arrows and the state point on both diagrams. Drag the timeline bar or the point on
  either diagram to scrub. → and ← step one process at a time; 1, 2, 3 switch between Otto,
  Diesel and dual.
- **Change the design.** Every parameter (r, q_in, r_c, r_p, T₁, P₁, k) has a slider and a
  number box. The diagrams, results, state table and energy panel update at once.
- **Step through the analysis.** "Guided tour" plays one process at a time and stops at each
  state with a card explaining what happens, with the equations typeset and the current
  numbers substituted.
- **Check the first law.** The energy panel shows heat, work and Δu per process; shading on the
  diagrams shows the work (P–v) and heat (T–s) as areas.
- **Compare two cycles.** Compare mode puts any two cycles side by side on one timeline, with
  the same compression ratio and heat input, the same peak pressure and heat input, or nothing
  held equal.
- **Lecture use.** "Focus" (or the F key) hides everything below the transport bar, lets the
  engine and diagrams fill the screen, and makes the text about 25 % larger. The light theme is
  meant for projectors; the moon button switches to the dark theme (by default the page follows
  the operating system).

It works on phones too: the piston and the P–v diagram stay at the top of the screen and the
play controls at the bottom while you scroll through the rest.

## The model

Cold-air-standard analysis, as in the textbook chapters on gas power cycles:

- the working fluid is a fixed mass of air, treated as an ideal gas, that is never replaced;
- every process is internally reversible;
- combustion is replaced by heat added from outside, and the exhaust by heat rejected at
  constant volume;
- specific heats are constant (k = 1.4 by default, adjustable from 1.2 to 1.67).

The optional intake and exhaust strokes are drawn for orientation only; their work cancels and
they do not enter the cycle analysis. Because the specific heats are constant, the numbers
differ from examples worked with the air tables (variable specific heats). The page's "Model"
button lists all of this for students; the full model, including the animation timeline, is
written out in [docs/PHYSICS.md](docs/PHYSICS.md).

Notation follows Çengel & Boles, *Thermodynamics: An Engineering Approach*: states 1-2-3-4
(1-2-x-3-4 for the dual cycle), heat and work as magnitudes with in/out subscripts, SI units.

## Run it locally

Requires Node 22 or newer (for the tests) and Python 3 (only to serve the files). There is
nothing to install and no build step: the site is the `site/` folder as it is.

```bash
npm run serve
```

Then open http://localhost:8000. Any other static file server pointed at `site/` works too.

## Test it

```bash
npm test
```

This runs Node's built-in test runner on `tests/`. The tests cover the model, not the page:
every state, heat and work value is checked against
`tests/fixtures/reference-cycles.json`, which an independent Python implementation
(`tools/reference_cycles.py`, run with `npm run fixture`) generates. The tests also typeset
every equation in the teaching text with KaTeX.

## Editing the teaching text

All explanations, equations and labels students read are in
[site/js/content/content.js](site/js/content/content.js). It is plain data, so you can edit
it without touching any other code:

- Prose is written as ``t`...` ``, and inline math sits between dollar signs:
  ``t`the compression ratio $r = v_1/v_2$` ``. Backslashes need no escaping.
- Each equation has a symbolic form (`tex`) and a form with numbers (`num`). In `num`,
  `\val{name}` is replaced by the current value; the names you can use are listed at the top
  of the file.
- Each process card has `title`, `what`, `engine`, `energy`, `trends`, `equations` and
  `notice`; the comment at the top of the file explains each convention.

After editing, run `npm test`. It renders every equation and fails with the offending string if
KaTeX cannot typeset it or a `\val` name does not exist. Then reload the page.

## How it is organized

| Path | What |
|---|---|
| `site/` | The website: `index.html`, `css/`, `js/`, and KaTeX in `vendor/katex/` |
| `site/js/core/` | The thermodynamic model and everything else worth testing, with no DOM code |
| `site/js/ui/` | One file per view (engine, diagrams, transport, panels) |
| `site/js/content/content.js` | The teaching text |
| `site/css/tokens.css` | Colors (light and dark), type sizes and spacing |
| `docs/` | The specification, the physics and the build plan |
| `tests/` | Tests and the reference fixture |

The process colors (cool for the isentropic processes, warm for heat transfer) were chosen
together and checked for color-vision deficiency in both themes; they are defined once in
`tokens.css`.

## License

MIT. See [LICENSE](LICENSE). You are welcome to use and adapt this in your own course.
