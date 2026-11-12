# IC cycles

An interactive explorer for the ideal Otto, Diesel and dual cycles, made for undergraduate
thermodynamics courses. An animated piston–cylinder moves in step with the state point on the
P–v and T–s diagrams, so each process can be watched as a piston motion and as a path on the
diagram at the same time.

**Status:** under construction. The model, the reference numbers and the teaching text are in
place; the page itself is being built milestone by milestone (see
[docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)).

## The model

Cold-air-standard analysis: a fixed mass of air as an ideal gas, internally reversible
processes, constant specific heats (k adjustable, 1.4 by default). Notation follows Çengel &
Boles, *Thermodynamics: An Engineering Approach*. The full model is written out in
[docs/PHYSICS.md](docs/PHYSICS.md).

## Run it locally

Requires Node 22 or newer and Python 3 (only to serve the files).

```bash
npm test
npm run serve
```

Then open http://localhost:8000.

## Editing the teaching text

All explanations and equations are in
[site/js/content/content.js](site/js/content/content.js). Equations are LaTeX. Run `npm test`
after editing; it checks the file for broken references and unbalanced braces.

## License

MIT. See [LICENSE](LICENSE). You are welcome to use and adapt this in your own course.
