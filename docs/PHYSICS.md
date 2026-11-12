# Physics and animation model

This is the contract for everything in `site/js/core/`. Implement it exactly. The numbers in
`tests/fixtures/reference-cycles.json` were produced by an independent Python implementation of
this document (`tools/reference_cycles.py`) and are the oracle: if a test against the fixture
fails, the JavaScript is wrong.

## 1. Assumptions and constants

Cold-air-standard cycles: a fixed mass of ideal gas, internally reversible processes, constant
specific heats.

| Quantity | Symbol | Unit (used everywhere, internally and on screen) |
|---|---|---|
| Pressure | P | kPa |
| Temperature | T | K |
| Specific volume | v | m³/kg |
| Specific entropy, relative to state 1 | s | kJ/kg·K |
| Heat and work per unit mass | q, w | kJ/kg |
| Crank angle | θ | rad |

The gas is defined by two numbers: `R = 0.287` kJ/kg·K (fixed) and `k` (user-adjustable, default
1.4). From them `cv = R/(k−1)` and `cp = k·cv`. Do not hard-code 0.718 or 1.005: with the exact
definitions, `cp − cv = R` and `cp/cv = k` hold exactly, and every closed-form check below is
exact. At k = 1.4 this gives cv = 0.7175 and cp = 1.0045.

## 2. One cycle family

Otto, Diesel and dual are one family with five states, `1, 2, x, 3, 4`, and three ratios:

- compression ratio `r = v1/v2`
- pressure ratio `rp = Px/P2` (constant-volume heat addition)
- cutoff ratio `rc = v3/vx` (constant-pressure heat addition)

Otto is `rc = 1` (so state x coincides with state 3). Diesel is `rp = 1` (x coincides with 2).
State numbers mean the same thing in all three: 1 start of compression (BDC), 2 end of
compression (TDC), 3 end of heat addition (peak temperature), 4 end of expansion (BDC).

Given `P1, T1, r, rp, rc` and the gas:

| State | v | T | P | s |
|---|---|---|---|---|
| 1 | `R·T1/P1` | `T1` | `P1` | `0` |
| 2 | `v1/r` | `T1·r^(k−1)` | `P1·r^k` | `0` |
| x | `v2` | `rp·T2` | `rp·P2` | `cv·ln(Tx/T2)` |
| 3 | `rc·v2` | `rc·Tx` | `Px` | `sx + cp·ln(T3/Tx)` |
| 4 | `v1` | `T3·(v3/v1)^(k−1)` | `P3·(v3/v1)^k` | `s3` |

Checks that must hold: `P·v = R·T` at every state, `T4 = rp·rc^k·T1`, and
`s4 + cv·ln(T1/T4) = 0` (the entropy closes).

### Processes by cycle type

| Type | Processes (id: kind, role) |
|---|---|
| `otto` | `1-2` isentropic compression · `2-3` constV heatAdditionV · `3-4` isentropic expansion · `4-1` constV heatRejection |
| `diesel` | `1-2` isentropic compression · `2-3` constP heatAdditionP · `3-4` isentropic expansion · `4-1` constV heatRejection |
| `dual` | `1-2` isentropic compression · `2-x` constV heatAdditionV · `x-3` constP heatAdditionP · `3-4` isentropic expansion · `4-1` constV heatRejection |

`kind` is one of `isentropic`, `constV`, `constP`. `role` is one of `compression`,
`heatAdditionV`, `heatAdditionP`, `expansion`, `heatRejection` (plus `exhaust` and `intake` for
the optional strokes, section 8). Roles drive colors and timeline slots.

A heat-addition process is **degenerate** when it has zero length: `|Tb − Ta| ≤ 1e-9·Ta`. That
happens in a dual cycle with `rp = 1` or `rc = 1`. Degenerate processes stay in the process list
with q = w = 0 but get no timeline slot, no curve, and no state label for the coincident state.

### Native inputs of each type

The UI stores the parameters a textbook problem would give, and converts them to ratios:

| Type | Stored parameters | Ratios |
|---|---|---|
| `otto` | `r`, `qin` | `rp = 1 + qin/(cv·T2)`, `rc = 1` |
| `diesel` | `r`, `rc` | `rp = 1` |
| `dual` | `r`, `rp`, `rc` | as given |

So changing `r` on the Otto cycle keeps `qin` fixed, and on the Diesel cycle keeps `rc` fixed.

## 3. Energy

Signed, per unit mass, with **q > 0 heat to the gas** and **w > 0 work done by the gas**, so
`q − w = Δu` for every process:

| Kind | q | w | Δu |
|---|---|---|---|
| isentropic a→b | 0 | `cv·(Ta − Tb)` | `cv·(Tb − Ta)` |
| constV a→b | `cv·(Tb − Ta)` | 0 | `cv·(Tb − Ta)` |
| constP a→b | `cp·(Tb − Ta)` | `Pa·(vb − va)` | `cv·(Tb − Ta)` |

The screen never shows signed values. It follows the textbook's direction subscripts: a negative
w is shown as `w_in`, a positive one as `w_out`, likewise `q_in` and `q_out`, all as magnitudes.

Cycle metrics:

- `qin` = sum of positive q, `qout` = −(sum of negative q), `wnet` = sum of w (= qin − qout)
- `win` = −(sum of negative w), `wout` = sum of positive w
- `eta = wnet/qin`, `mep = wnet/(v1 − v2)` (kJ/kg ÷ m³/kg = kPa)
- `Tmax = T3`, `Pmax = P3`, `etaCarnot = 1 − T1/T3`

Closed-form efficiency, used for the efficiency curves and as a test of the numerical result:

```
eta = 1 − r^(1−k) · (rp·rc^k − 1) / ((rp − 1) + k·rp·(rc − 1))
```

With `rc = 1` this is the Otto formula `1 − r^(1−k)`; with `rp = 1` it is the Diesel formula.
When both are 1 the fraction is 0/0: return the Otto value for the curve, and `NaN` for a solved
cycle with `qin = 0` (the UI shows "—").

## 4. Paths along a process

`pointOnProcess(solution, processId, λ)` returns `{P, T, v, s}` for `λ ∈ [0, 1]`:

- isentropic: `v = va + λ(vb − va)`, `T = Ta·(va/v)^(k−1)`, `P = Pa·(va/v)^k`, `s = sa`
- constP: `v = va + λ(vb − va)`, `P = Pa`, `T = Ta·v/va`, `s = sa + cp·ln(T/Ta)`
- constV: `T = Ta + λ(Tb − Ta)`, `v = va`, `P = Pa·T/Ta`, `s = sa + cv·ln(T/Ta)`

So λ is linear in volume for the processes where the piston moves, and linear in temperature
where it does not. `energyAlong(solution, processId, state)` returns the running `{q, w, du}`
from the start of the process to `state`, using the table in section 3 with `Tb, vb` replaced by
the current values.

For drawing, `sampleProcess(solution, processId, n)` returns points with their λ. Sample
isentropes with geometric spacing in v (`v_i = va·(vb/va)^(i/n)`, n = 64) so the steep end near
TDC stays smooth; sample the other two kinds uniformly in λ (n = 32, they are straight on P–v
but exponential on T–s).

## 5. Piston kinematics

A slider-crank with rod-to-crank ratio `ρ = 3`. Crank angle `θ = 0` at TDC and `θ = π` at BDC.
Normalized piston position, 0 at TDC and 1 at BDC:

```
xhat(θ) = ((1 − cos θ) + ρ − sqrt(ρ² − sin²θ)) / 2
```

Inverse on the down-stroke branch `θ ∈ [0, π]`:

```
d = ρ + 1 − 2·xhat
θ = acos(clamp((1 + d² − ρ²) / (2d), −1, 1))
```

Cylinder volume per unit trapped mass: `vCyl = v2 + (v1 − v2)·xhat`. For the drawing, the crank
pin is at `(a·sin θ, −a·cos θ)` from the crank center and the wrist pin is
`a·cos θ + sqrt(l² − a²·sin²θ)` above it, with `l = ρ·a`.

## 6. Timeline

Everything on screen is driven by one number, the phase `u ∈ [0, 1)`. The cycle is a fixed
sequence of **slots**, one process per slot:

| Slot | Process role | Seconds at 1× | Piston |
|---|---|---|---|
| `C` | compression | 2.4 | BDC → TDC, `θ = π + τ·π` |
| `HV` | heatAdditionV | 1.4 | dwells at TDC, `θ = 0` |
| `HP` | heatAdditionP | 1.4 | TDC → position of state 3, `θ = τ·θ3` |
| `E` | expansion | 2.4 | → BDC, `θ = θ3 + τ·(π − θ3)` |
| `R` | heatRejection | 1.4 | dwells at BDC, `θ = π` |
| `X` | exhaust (optional) | 2.4 | BDC → TDC, `θ = π + τ·π` |
| `I` | intake (optional) | 2.4 | TDC → BDC, `θ = τ·π` |

`τ ∈ [0, 1)` is the fraction of the slot elapsed. `θ3 = thetaFromXhat((v3 − v2)/(v1 − v2))`, or
0 when the cycle has no constant-pressure process.

A slot has zero length when the cycle has no non-degenerate process for it (Otto has no `HP`,
Diesel has no `HV`). `X` and `I` exist only when the strokes are switched on. Slot boundaries in
phase are `u0 = t0/total`, `u1 = u0 + seconds/total`. Slots are half-open, `[u0, u1)`.

`buildTimeline(solution, {strokes, force})` returns all seven slots in order, including the
empty ones:

```js
{ slots: [ { id, processId, seconds, u0, u1 }, … ], totalSeconds }
```

`processId` is `null` for a slot the cycle has no process for (empty or forced).

The crank turns at a constant rate inside a slot but the rate differs between slots. That is
deliberate: each process gets enough time to be watched, and constant-pressure heat addition
(which covers only about 24° of crank in the default Diesel cycle) would otherwise flash past.

Position along the process inside a slot:

| Slot | λ |
|---|---|
| `C` | `1 − xhat` |
| `HV`, `R` | `smoothstep(τ) = τ²(3 − 2τ)` |
| `HP` | `(vCyl − v2)/(v3 − v2)` |
| `E` | `(vCyl − v3)/(v1 − v3)` |

**Forced slots (compare mode).** Two cycles share one timeline, the union of their slots. A
cycle that lacks a slot the other one has is given it anyway (`force`) and waits there: in a
forced `HV` it sits at state 2, in a forced `HP` it sits at state 3, with `waiting = true`,
`θ = 0`. So in an Otto-versus-Diesel comparison the Otto piston holds at TDC through its heat
addition and then waits, while the Diesel piston waits and then adds heat as it moves down.

`frameAt(solution, timeline, u)` returns one object that every view reads:

```js
{
  phase, slot, tau,            // where we are
  processId, lambda, role,     // which process, how far along it
  state: { P, T, v, s },       // the gas in the cylinder
  theta, xhat, vCyl,           // crank angle, piston position, cylinder volume per unit trapped mass
  massFraction,                // 1 in the closed cycle; vCyl/v1 during X and I
  waiting,                     // true only in a forced slot
  energy: { q, w, du },        // running signed totals for the current process
  heatIn, heatOut,             // 0..1 drawing intensity: 0.35 + 0.65·sin(π·τ) during heat addition / rejection, else 0 (0 while waiting)
  workSign,                    // −1 work on the gas (C, X), +1 work by the gas (HP, E, I), 0 otherwise
  valves: { intake, exhaust }  // lift 0..1: min(1, τ/0.12, (1−τ)/0.12) in I / X, else 0
}
```

`statePhases(timeline)` gives the phase at which the cycle reaches each state. They are slot
boundaries: `1 → 0`, `2 → C.u1`, `x → HV.u1`, `3 → HP.u1`, `4 → E.u1`, `1end → R.u1`, and
`0 → X.u1` when the strokes are on.

**When parameters change**, keep the same slot and the same τ and recompute the phase from the
new timeline (if that slot no longer exists, go to the start of the next slot that does). The
crank stays where it is and the gas state changes around it.

## 7. Compare-mode solvers

Both cycles in a comparison share `P1`, `T1` and `k`. `xv` is the fraction of the heat added at
constant volume: 1 for Otto, 0 for Diesel, a slider for dual.

```
ratiosFromHeat({r, qin, xv}):
  T2 = T1·r^(k−1)
  rp = 1 + xv·qin/(cv·T2)
  rc = 1 + (1 − xv)·qin/(cp·rp·T2)
```

- **Same compression ratio and heat input:** shared `r` and `qin`; each side uses
  `ratiosFromHeat`.
- **Same peak pressure and heat input:** shared `Pmax` and `qin`. Each side first solves for its
  own `r` from `P1·(r^k + xv·qin·r/(cv·T1)) = Pmax`. The left side increases monotonically with
  r, so bisect on `[1, (Pmax/P1)^(1/k)]`. If the left side already exceeds `Pmax` at r = 1 there
  is no solution: return `null` and let the UI say the pressure is too low for that heat input.
  Then use `ratiosFromHeat`.
- **Nothing held equal:** each side uses its own native parameters through `ratiosFor`.

`sideRatios(constraint, shared, side, P1, T1, gas)` wraps the three cases and returns
`{r, rp, rc}` or `null`. `constraint` is `"independent"`, `"same-r-qin"` or `"same-pmax-qin"`;
`shared` holds `{r, qin}` or `{Pmax, qin}`; `side` holds `{type, xv, params}`.

## 8. Optional intake and exhaust strokes

With the strokes switched on, two slots follow heat rejection: exhaust `1→0` (BDC to TDC) and
intake `0→1` (TDC to BDC). In the idealization the gas in the cylinder stays at `P1, T1` the
whole time and only its amount changes:

- `state` is state 1 throughout; `massFraction = vCyl/v1`.
- On the P–v diagram the point moves along a horizontal line at `P1` from `v1` to `v2` and back,
  using `vCyl` as its abscissa. On the T–s diagram it stays on state 1.
- Process ids are `1-0` (λ = 1 − xhat) and `0-1` (λ = xhat). They are not in
  `solution.processes`.
- Running energy: exhaust `w = P1·(vCyl − v1)` (negative: work on the gas), intake
  `w = P1·(vCyl − v2)` (positive), q = 0. The two total `∓P1·(v1 − v2)` and cancel.

## 9. Core API

All modules are pure ES modules with no DOM access, so they run under Node for tests.

| Module | Exports |
|---|---|
| `core/gas.js` | `makeGas({k, R})` → `{k, R, cv, cp}` |
| `core/cycle.js` | `PROCESS_TABLE`, `ratiosFor(type, params, T1, gas)`, `ratiosFromHeat({r, qin, xv}, T1, gas)`, `solveCycle({type, P1, T1, r, rp, rc, gas})`, `etaClosedForm({r, rp, rc, k})` |
| `core/paths.js` | `pointOnProcess`, `energyAlong`, `sampleProcess` |
| `core/kinematics.js` | `RHO`, `xhat(θ)`, `thetaFromXhat(x)`, `smoothstep(τ)` |
| `core/timeline.js` | `SLOT_ORDER`, `SLOT_SECONDS`, `slotProcesses(solution)`, `buildTimeline(solution, {strokes, force})`, `frameAt(solution, timeline, u)`, `statePhases(timeline)`, `phaseOfSlot(timeline, slotId, tau)` |
| `core/compare.js` | `solveRForPmax({Pmax, qin, xv}, P1, T1, gas)`, `sideRatios(constraint, shared, side, P1, T1, gas)` |
| `core/format.js` | number formatting (section 11) |

`solveCycle` returns

```js
{
  type, gas,
  inputs: { P1, T1, r, rp, rc },
  states: { "1": {P, T, v, s}, "2": {…}, "x": {…}, "3": {…}, "4": {…} },
  processes: [ { id, kind, role, from, to, q, w, du, degenerate }, … ],
  metrics: { qin, qout, wnet, win, wout, eta, mep, Tmax, Pmax, etaCarnot }
}
```

Key names and shapes match the fixture so tests can compare objects field by field.

## 10. The fixture and the tests to write

`tests/fixtures/reference-cycles.json` (regenerate with `npm run fixture`; never edit by hand):

| Section | Contents |
|---|---|
| `cycles[]` | nine cases: `spec` (inputs in the native form of section 2), `gas`, `ratios`, `states`, `processes`, `metrics`, and `midpoints` (points at λ = 0.25, 0.5, 0.75 on every process, with running energy) |
| `efficiency[]` | closed-form η for Otto, Diesel and dual over a grid of r, rc and k |
| `kinematics` | `xhat` every 15° for ρ = 3 |
| `timelines[]` | nine cases: slot table, `statePhases`, and 16 frames (24 with strokes) at `u = (j + 0.5)/n`. Includes two forced-slot cases |
| `compare[]` | four cases of the two constraints, each side's ratios and metrics |

Compare with relative tolerance `1e-9` (absolute `1e-9` where the expected value is 0).

Required tests, beyond reproducing every number in the fixture:

1. First law: `q − w = du` for every process, `Σq = Σw`, `Σdu = 0`.
2. Ideal gas law at all five states and at every fixture midpoint.
3. `eta` equals `etaClosedForm` for random valid inputs.
4. Limits: a dual cycle with `rc = 1` reproduces the Otto solution with the same `rp`; with
   `rp = 1` it reproduces the Diesel solution. Degenerate processes are flagged.
5. Continuity: for every timeline case, the frame just before a slot boundary and the frame just
   after it agree in P, T, v and xhat; phase 0 is state 1; `frameAt(statePhases[n])` is state n.
6. Monotonic piston: xhat decreases through `C` and `X`, increases through `HP`, `E` and `I`.
7. `thetaFromXhat(xhat(θ)) = θ` on `[0, π]`.
8. `phaseOfSlot` round-trips with `frameAt` (`slot` and `tau` come back).
9. `solveRForPmax` returns a cycle whose `Pmax` and `qin` match the request, and `null` when
   infeasible.

Reference values at a glance (P1 = 100 kPa, T1 = 300 K, k = 1.4 unless noted):

| Case | r | rp | rc | T2 | T3 | T4 | P3 | qin | qout | wnet | η | MEP |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Otto, qin = 800 | 8 | 2.6177 | 1 | 689.2 | 1804.2 | 785.3 | 4811 | 800.0 | 348.2 | 451.8 | 56.47 % | 599.7 |
| Diesel | 18 | 1 | 2 | 953.3 | 1906.6 | 791.7 | 5720 | 957.6 | 352.8 | 604.8 | 63.16 % | 743.8 |
| Dual | 16 | 1.5 | 1.5 | 909.4 | 2046.2 | 793.9 | 7275 | 1011.4 | 354.3 | 657.1 | 64.97 % | 814.0 |

Compare mode: at r = 12 and qin = 1000, Otto 62.99 %, dual (xv = 0.5) 61.84 %, Diesel 55.45 %.
At Pmax = 7000 kPa and qin = 1000, Diesel 65.29 % (r = 20.79), dual 63.69 % (r = 13.56), Otto
59.88 % (r = 9.81).

## 11. Number formatting

One module, `core/format.js`, formats every number shown. No `toFixed` calls scattered in views.

| Quantity | Format | Example |
|---|---|---|
| T | 1 decimal | `689.2` |
| P | 4 significant figures, no decimals at or above 1000 | `100.0`, `4811` |
| v | 4 significant figures | `0.8610`, `0.1076` |
| s | 4 decimals | `0.6906` |
| q, w, u | 1 decimal | `451.8` |
| MEP | 1 decimal | `599.7` |
| η | percent, 1 decimal | `56.5 %` |
| ratios, k | up to 3 decimals, trailing zeros trimmed | `8`, `2.618`, `1.4` |
| cv, cp | 4 decimals | `0.7175` |

Use a true minus sign (U+2212) for negatives, and `—` for values that do not exist.

For `\val{…}` substitution in equations, format as above and then trim trailing zeros and a
trailing decimal point, so inputs read as typed: `(300)(8)^{0.4}`, not `(300.0)(8)^{0.4}`.
`eta` becomes a TeX-safe percentage such as `56.5\%`.
