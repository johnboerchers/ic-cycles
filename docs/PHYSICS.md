# Physics and animation model

This is the contract for everything in `site/js/core/`. Implement it exactly. The numbers in
`tests/fixtures/reference-cycles.json` were produced by an independent Python implementation of
this document (`tools/reference_cycles.py`) and are the oracle: if a test against the fixture
fails, the JavaScript is wrong.

## 1. Assumptions and constants

Cold-air-standard cycles: a fixed mass of ideal gas, internally reversible processes, constant
specific heats. This is the default model. Section 12 adds a second one, air with
temperature-dependent specific heats; it says what changes, and the rest applies to both.

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

Key names and shapes match the fixture so tests can compare objects field by field. Section
12.2 extends the gas object so that the same functions serve both gas models.

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

Section 12.7 describes the second fixture, for variable specific heats, and section 13 the
third, for friction.

## 11. Number formatting

One module, `core/format.js`, formats every number shown. No `toFixed` calls scattered in views.

| Quantity | Format | Example |
|---|---|---|
| T | 1 decimal | `689.2` |
| P | 4 significant figures, no decimals at or above 1000 | `100.0`, `4811` |
| v | 4 significant figures | `0.8610`, `0.1076` |
| s | 4 decimals | `0.6905` |
| q, w, u | 1 decimal | `451.8` |
| MEP | 1 decimal | `599.7` |
| η | percent, 1 decimal | `56.5 %` |
| ratios, k | up to 3 decimals, trailing zeros trimmed | `8`, `2.618`, `1.4` |
| cv, cp | 4 decimals | `0.7175` |

Use a true minus sign (U+2212) for negatives, and `—` for values that do not exist.

For `\val{…}` substitution in equations, format as above. Then, **only for values the user
typed in**, trim trailing zeros and a trailing decimal point so they read as typed:
`(300)(8)^{0.4}`, not `(300.0)(8)^{0.4}`. Those values are `T1`, `P1`, `k`, `km1`, `R` and `r`
for every cycle, plus `qin` for Otto, `rc` for Diesel and dual, and `rp` for dual. Every
computed value keeps its full format, so a card agrees with the tables and tiles beside it:
`731.0`, `0.8610`, `65.0\%`. `eta` is a TeX-safe percentage such as `56.5\%`.

## 12. Variable specific heats (air standard)

A second gas model, chosen with `state.specificHeats = "variable"`; the default stays
`"constant"` (sections 1–11). It is the textbook's air-standard analysis: still a fixed mass
of ideal gas and internally reversible processes, but the specific heats of air depend on
temperature. Everything in sections 2–8 still holds (the same states, processes, timeline,
slots, piston motion and frames) except the closed forms that assume a constant k. The ratios
r, rp, rc keep their meaning, and because the gas is still ideal, `Tx = rp·T2` and
`T3 = rc·Tx` remain exact.

### 12.1 Properties of air

Air is one ideal gas with `R = 0.287` kJ/kg·K (unchanged) and properties from a NASA
7-coefficient polynomial. The coefficients are those of N2, O2 and Ar from the GRI-Mech 3.0
data (as distributed with Cantera), weighted by mole fraction (0.7808, 0.2095, 0.0097), with
a6 shifted so that h = 0 at 0 K (the zero of the air table), and the upper row's a6 and a7
re-anchored so that h and s° are continuous at 1000 K. `tools/reference_cycles.py` builds them.
Use these values verbatim; they are also in the fixture under `air.low` and `air.high`:

```js
// [a1, a2, a3, a4, a5, a6, a7]: AIR_LOW for T <= 1000 K, AIR_HIGH for T > 1000 K
const AIR_LOW = [3.3922816090200003, 0.00047173829780000013, -1.0314739665050002e-06, 2.376663590645e-09, -1.229380909685e-12, 12.958819478564692, 3.893083723035];
const AIR_HIGH = [2.9970621894800002, 0.0014725191250700002, -6.026600779555001e-07, 1.227217539765e-10, -9.8132542451e-15, 84.42179061287595, 5.854397014870135];
```

For 200 K ≤ T ≤ 3500 K, with `a = AIR_LOW` when T ≤ 1000 K and `AIR_HIGH` otherwise:

| Property | Formula |
|---|---|
| cp(T) | R·(a1 + a2·T + a3·T² + a4·T³ + a5·T⁴) |
| h(T) | R·[T·(a1 + a2·T/2 + a3·T²/3 + a4·T³/4 + a5·T⁴/5) + a6] |
| s°(T) | R·(a1·ln T + a2·T + a3·T²/2 + a4·T³/3 + a5·T⁴/4 + a7) |
| cv(T), u(T), k(T) | cp − R, h − R·T, cp/cv |

Outside [200, 3500] K, cp is held at its value at the nearer edge `Tb`:
`h(T) = h(Tb) + cp(Tb)·(T − Tb)` and `s°(T) = s°(Tb) + cp(Tb)·ln(T/Tb)`. So every function is
defined and continuous for all T > 0, and u, h and s° increase with T. Temperatures below
250 K never occur; above 3500 K happens only at the far ends of the sliders, and the page says
so (SPEC section 19).

Entropy between two states: `s_b − s_a = s°(Tb) − s°(Ta) − R·ln(Pb/Pa)`. Along an isentrope,
`ψ(Tb) = ψ(Ta) − R·ln(vb/va)` with `ψ(T) = s°(T) − R·ln T` (and `ψ' = cv/T > 0`). This is the
air table's relative-specific-volume method: `v_r ∝ exp(−ψ/R)`.

Spot values: cp = 1.0031, 1.1422, 1.2502 kJ/kg·K and k = 1.4008, 1.3356, 1.2980 at 300, 1000
and 2000 K; u(300 K) = 214.33 and h(1000 K) = 1046.28 kJ/kg. These agree with the air table in
Çengel & Boles to within a fraction of a percent.

### 12.2 The gas interface

Both gas models expose the same members, and the core uses only these; no formula multiplies a
temperature difference by `gas.cv` any more.

| Member | Constant gas, `makeGas({k, R})` | Variable gas, `makeAir()` |
|---|---|---|
| `kind` | `"constant"` | `"variable"` |
| `R` | R | 0.287 |
| `k`, `cv`, `cp` | numbers, as now | absent |
| `cpAt(T)`, `cvAt(T)`, `kAt(T)` | the constants | section 12.1 |
| `u(T)`, `h(T)` | cv·T, cp·T | section 12.1 |
| `sT(T)` | cp·ln T | s°(T) |
| `TfromU(u)`, `TfromH(h)` | u/cv, h/cp | solved |
| `isentropicT(Ta, vRatio)` | Ta·vRatio^(1−k) | solved: ψ(T) = ψ(Ta) − R·ln(vRatio) |

`vRatio` is `vb/va`. Solving: Newton's method on the increasing function (derivatives
`u' = cv`, `h' = cp`, `ψ' = cv/T`), starting from the constant-k estimate with k = 1.4; stop
when the step is below `1e-12·T`; keep a bracket (start `[1, 1e5]` K) and take a bisection
step whenever a Newton step would leave it. The Python reference deliberately uses plain
bisection, so the two implementations check each other.

### 12.3 What changes in the cycle

| Item | Constant k (sections 2–7) | General form, used for both gases |
|---|---|---|
| T2 | T1·r^(k−1) | `isentropicT(T1, 1/r)` |
| P2 | P1·r^k | R·T2/v2 |
| T4 | T3·(v3/v1)^(k−1) | `isentropicT(T3, v1/v3)` |
| P4 | P3·(v3/v1)^k | R·T4/v1 |
| sx | cv·ln(Tx/T2) | sT(Tx) − sT(T2) − R·ln(Tx/T2) |
| s3 | sx + cp·ln(T3/Tx) | sx + sT(T3) − sT(Tx) |
| Δu of any process | cv·(Tb − Ta) | u(Tb) − u(Ta) |
| q, constant pressure | cp·(Tb − Ta) | h(Tb) − h(Ta) |
| Otto rp (`ratiosFor`) | 1 + qin/(cv·T2) | `TfromU(u(T2) + qin)/T2` |
| `ratiosFromHeat` | section 7 | `Tx = TfromU(u(T2) + xv·qin)`, `rp = Tx/T2`, `T3 = TfromH(h(Tx) + (1 − xv)·qin)`, `rc = T3/Tx` |
| `solveRForPmax` | section 7 | P3(r) = P1·r·Tx(r)/T1 with Tx as above; bisect on `[1, Pmax/P1]`; `null` if P3(1) > Pmax |

In `ratiosFromHeat`, skip a solve whose heat is zero, so that `rp = 1` or `rc = 1` exactly.
With the constant gas, every general form reduces to its closed form, and the existing fixture
must keep passing at 1e-9. Implement the general form once rather than two code paths.
Process energies and metrics are otherwise as section 3; `etaClosedForm` applies to the
constant gas only.

Paths (section 4), general form:

- constV: T linear in λ, `P = Pa·T/Ta`, `s = sa + sT(T) − sT(Ta) − R·ln(T/Ta)`
- constP: v linear in λ, `T = Ta·v/va`, `s = sa + sT(T) − sT(Ta)`
- isentropic: v linear in λ, `T = isentropicT(Ta, v/va)`, `P = Pa·(va/v)·(T/Ta)`, `s = sa`

`energyAlong`: `du = u(T) − u(Ta)`; for constP `q = h(T) − h(Ta)`. The state table's
`u − u1` is `u(T) − u(T1)`.

### 12.4 The cold-air reference cycle

In explore mode with variable specific heats, the model also solves the same cycle (same type
and native parameters, same T1 and P1) with the constant gas at k = 1.4, whatever the hidden k
slider says: the "cold" cycle. It feeds the faint reference outline, the cold-air line in the
results, and `\val{etaCold}`. Compare mode has no cold cycle.

### 12.5 Equation values

`core/values.js` gains the names `u1 u2 ux u3 u4` (u at each state), `h2 hx h3` and `etaCold`.
u and h use the `u` format (1 decimal); `etaCold` uses `eta`; all are computed, so none is
trimmed. The signature becomes `texValues(solution, cold)`, with
`etaCold = (cold ?? solution).metrics.eta`. Every name must exist for both gases: for the
variable gas, `k`, `km1`, `cv` and `cp` are evaluated at T1 (the variable-mode text never uses
them).

### 12.6 Efficiency curves

The closed form serves the constant gas only. For the variable gas, each curve point is a
complete cycle solved at that r, holding fixed what the chart holds fixed: Otto's qin, Diesel's
rc, the dual cycle's rp and rc (explore mode), or the "hold equal" quantities of section 7
(compare mode). Skip points where rc ≥ r, where state 3 would lie past BDC.

### 12.7 The second fixture

`tests/fixtures/reference-variable.json`, written by the same `npm run fixture`. Sections:
`air` (the coefficients; property samples from 150 to 6000 K, including both extended ends;
`fromU`, `fromH` and `isentropes` samples), `cycles` (ten cases, each with `stateProps`, the
properties at each state, and `cold`, the k = 1.4 reference), `compare` (four cases),
`efficiency` (a grid), and `timelines` (seven cases, including the strokes and forced slots).
Same tolerance as section 10.

Reference values (P1 = 100 kPa, T1 = 300 K unless noted):

| Case | T2 | T3 | T4 | P3 | qin | qout | wnet | η | MEP | η, cold air |
|---|---|---|---|---|---|---|---|---|---|---|
| Otto, r = 8, qin = 800 | 672.6 | 1592.9 | 805.4 | 4248 | 800.0 | 382.5 | 417.5 | 52.18 % | 554.1 | 56.47 % |
| the same at T1 = 290 K | 651.9 | 1575.7 | 795.4 | 4347 | 800.0 | 381.6 | 418.4 | 52.30 % | 574.6 | 56.47 % |
| Diesel, r = 18, rc = 2 | 898.0 | 1796.0 | 886.7 | 5388 | 1066.9 | 449.4 | 617.6 | 57.88 % | 759.5 | 63.16 % |
| Dual, r = 16, rp = rc = 1.5 | 862.1 | 1939.8 | 913.4 | 6897 | 1161.8 | 471.6 | 690.1 | 59.40 % | 855.0 | 64.97 % |

The second row is the textbook's air-table example (r = 8, 290 K, 800 kJ/kg); the air-table
solution gives 52.3 % and about 1575 K. Otto at r = 8 now depends on qin: 400 kJ/kg 53.73 %,
800 kJ/kg 52.18 %, 1600 kJ/kg 50.06 %. Compare mode at r = 12 and qin = 1000: Otto 57.84 %,
dual (xv = 0.5) 56.86 %, Diesel 51.31 %. At Pmax = 7000 kPa: Diesel 61.30 % (r = 21.879), dual
59.93 % (r = 14.862), Otto 56.82 % (r = 11.184). Both rankings, and so the compare takeaways in
`content.js`, hold for either gas.

## 13. Friction: indicated → brake

Friction sits on top of the ideal cycle and changes nothing in sections 2–12: no state,
process, path, frame or diagram. It turns the cycle's indicated quantities into brake
quantities for an engine of a given size and speed. It is on when `state.options.friction` is
true (default false), with its inputs in `state.engine`, and it works with either gas model.

Inputs: `fmep` (friction mean effective pressure, kPa), `Vd` (total displacement, L) and `N`
(engine speed, rev/min). A four-stroke engine: `n_R = 2` revolutions per cycle. From the solved
cycle: `imep = metrics.mep` and `Δv = v1 − v2`. Since kPa·L = J, every work per cycle comes out
in joules.

| Quantity | Formula | Unit |
|---|---|---|
| bmep | imep − fmep | kPa |
| η_m | bmep / imep | — |
| η_b | η_th · η_m (equal to w_b / q_in) | — |
| w_f, w_b | fmep · Δv, w_net − w_f | kJ/kg |
| ṁ | (Vd / 1000) / Δv · N / (60 · n_R) | kg/s |
| Q̇_in | ṁ · q_in | kW |
| Ẇ_i, Ẇ_f, Ẇ_b | imep · Vd · N / 120 000, and the same with fmep and bmep | kW |
| τ_i, τ_b | imep · Vd / (4π), bmep · Vd / (4π) | N·m |

`canRun = bmep > 0`. When the engine cannot run, η_m and η_b are shown as "—" and the brake
values as computed (zero or negative), with a note (SPEC section 20). When the cycle adds no
heat (imep = 0), η_m does not exist either: "—".

**Core API.** `core/friction.js` exports `frictionResults(solution, engine)`, returning an
object with exactly the keys of the fixture's `results`: `imep, fmep, bmep, canRun, etam, etab,
wf, wb, mdot, Qin, Wi, Wf, Wb, taui, taub`. It is pure and tested against
`tests/fixtures/reference-friction.json` (eight cases, both gas models, one that cannot run),
written by the same `npm run fixture`.

**Equation values.** `texValues(solution, cold, engine)` adds `imep fmep bmep etam etab Vd N Wb
taub`. When `engine` is not given, the engine defaults are used, so every name always exists.
Formats: `imep`, `bmep` as `mep`; `fmep` as `mep`, trimmed (typed); `etam`, `etab` as `eta`;
`Vd` as `ratio`, trimmed (typed); `N` as `rpm`; `Wb` as `power`; `taub` as `torque`.

**Formats added to section 11.** `power`: 1 decimal, kW (`22.5`). `torque`: 1 decimal, N·m
(`71.6`). `rpm`: a whole number with no separator (`3000`). Displacement uses `ratio` (`2`,
`1.6`).

Reference values (fmep = 150 kPa, Vd = 2.0 L, N = 3000 rev/min; constant specific heats with
k = 1.4 unless noted):

| Case | imep | bmep | η_th | η_m | η_b | Ẇ_i | Ẇ_b | τ_i | τ_b |
|---|---|---|---|---|---|---|---|---|---|
| Otto, r = 8, q_in = 800 | 599.7 | 449.7 | 56.5 % | 75.0 % | 42.3 % | 30.0 | 22.5 | 95.4 | 71.6 |
| Otto, q_in = 300 | 224.9 | 74.9 | 56.5 % | 33.3 % | 18.8 % | 11.2 | 3.7 | 35.8 | 11.9 |
| Otto, q_in = 200: cannot run | 149.9 | −0.1 | 56.5 % | — | — | 7.5 | −0.0 | 23.9 | −0.0 |
| Diesel, r = 18, r_c = 2 | 743.8 | 593.8 | 63.2 % | 79.8 % | 50.4 % | 37.2 | 29.7 | 118.4 | 94.5 |
| Otto, variable specific heats | 554.1 | 404.1 | 52.2 % | 72.9 % | 38.1 % | 27.7 | 20.2 | 88.2 | 64.3 |

For the default Otto cycle also: w_f = 113.0 and w_b = 338.8 kJ/kg, friction power 7.5 kW,
heat input 53.1 kW.
