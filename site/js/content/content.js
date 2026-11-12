// Teaching text and equations for the cycle explorer.
//
// This file is the single place to edit wording. It is plain data: no logic.
// Notation follows Cengel & Boles (P, v, T, s, k, r, r_c, MEP; dual cycle states 1-2-x-3-4).
//
// Conventions
//   - Every string is written with the `t` tag (String.raw), so TeX backslashes need no escaping.
//   - In prose, inline math sits between dollar signs:  t`... the ratio $r = v_1/v_2$ ...`
//   - `tex` is the symbolic equation. `num` is the same equation with the current numbers
//     substituted; \val{name} is replaced by a formatted value before KaTeX renders it.
//     Available names: T1 T2 Tx T3 T4  P1 P2 Px P3 P4  v1 v2 vx v3 v4  r rp rc rexp
//     k km1 R cv cp  qin qout wnet eta mep  w12 w34 qV qP wP wstroke
//     (w12 = compression work input, w34 = expansion work output, qV / qP = heat added at
//     constant volume / pressure, wP = work output during constant-pressure heat addition,
//     rexp = r / rc, wstroke = P1 (v1 - v2), eta is already a percentage with a TeX-safe "\%").
//   - `trends` says what each property does during the process: 'up', 'down' or 'const'.

const t = String.raw;

const compression = (extra = {}) => ({
  title: "Isentropic compression",
  what: t`The piston moves from BDC to TDC and squeezes the air into $1/r$ of its original volume. The process is adiabatic and reversible, so the entropy stays constant.`,
  engine: t`This is the compression stroke. Both valves are closed.`,
  energy: t`No heat is transferred. All of the work done on the air goes into its internal energy, so the temperature rises.`,
  trends: { P: "up", T: "up", v: "down", s: "const" },
  equations: [
    { tex: t`T_2 = T_1\,r^{\,k-1}`, num: t`T_2 = (\val{T1})(\val{r})^{\val{km1}} = \val{T2}\ \text{K}` },
    { tex: t`P_2 = P_1\,r^{\,k}`, num: t`P_2 = (\val{P1})(\val{r})^{\val{k}} = \val{P2}\ \text{kPa}` },
    { tex: t`w_{\text{in},1\text{-}2} = c_v\,(T_2 - T_1)`, num: t`w_{\text{in},1\text{-}2} = \val{cv}\,(\val{T2} - \val{T1}) = \val{w12}\ \text{kJ/kg}` },
  ],
  notice: t`On the T–s diagram the point climbs straight up: the temperature rises with no change in entropy. On the P–v diagram the area under the curve is the work put into the air.`,
  ...extra,
});

const heatRejection = (extra = {}) => ({
  title: "Constant-volume heat rejection",
  what: t`With the piston at BDC, heat $q_\text{out}$ leaves the air at constant volume until it is back at state 1, ready to start again.`,
  engine: t`This stands in for the exhaust: the exhaust valve opens, the hot gas blows down to ambient pressure, and it is replaced by a fresh charge. The ideal cycle treats all of that as cooling the same air.`,
  energy: t`No work is done. The internal energy the gas still has above state 1 leaves as heat.`,
  trends: { P: "down", T: "down", v: "const", s: "down" },
  equations: [
    { tex: t`q_\text{out} = c_v\,(T_4 - T_1)`, num: t`q_\text{out} = \val{cv}\,(\val{T4} - \val{T1}) = \val{qout}\ \text{kJ/kg}` },
    { tex: t`P_1 = P_4\,\frac{T_1}{T_4}`, num: t`P_1 = \val{P4}\,\frac{\val{T1}}{\val{T4}} = \val{P1}\ \text{kPa}` },
  ],
  notice: t`On the T–s diagram the area under this curve is the heat rejected. It is smaller than the area under the heat-addition curve, and the difference is the net work.`,
  ...extra,
});

const netWork = { tex: t`w_\text{net} = q_\text{in} - q_\text{out}`, num: t`w_\text{net} = \val{qin} - \val{qout} = \val{wnet}\ \text{kJ/kg}` };
const mep = { tex: t`\text{MEP} = \frac{w_\text{net}}{v_1 - v_2}`, num: t`\text{MEP} = \frac{\val{wnet}}{\val{v1} - \val{v2}} = \val{mep}\ \text{kPa}` };

export const CONTENT = {
  // ------------------------------------------------------------------ general
  model: {
    title: "About this model",
    points: [
      t`The working fluid is a fixed mass of air that behaves as an ideal gas. It is never replaced, so the cycle is a closed system.`,
      t`Every process is internally reversible: no friction and no pressure losses.`,
      t`Combustion is replaced by heat addition from an outside source, and the exhaust is replaced by heat rejection that returns the air to its starting state.`,
      t`Specific heats are constant (the cold-air-standard assumption). With $R = \val{R}$ and $k = \val{k}$: $c_v = R/(k-1) = \val{cv}$ and $c_p = k\,c_v = \val{cp}\ \text{kJ/kg·K}$.`,
    ],
    caveats: [
      t`Textbook examples solved with variable specific heats (air tables) give lower peak temperatures and efficiencies than this model.`,
      t`Hand calculations with the rounded table values $c_v = 0.718$ and $c_p = 1.005$ differ from the tool in the fourth digit.`,
      t`Real engines are considerably less efficient than these ideal cycles because of friction, heat loss, and combustion that is neither instantaneous nor complete.`,
    ],
  },

  roles: {
    compression: { label: "Isentropic compression", curve: t`s = \text{const}` },
    heatAdditionV: { label: "Constant-volume heat addition", curve: t`v = \text{const}` },
    heatAdditionP: { label: "Constant-pressure heat addition", curve: t`P = \text{const}` },
    expansion: { label: "Isentropic expansion", curve: t`s = \text{const}` },
    heatRejection: { label: "Constant-volume heat rejection", curve: t`v = \text{const}` },
    exhaust: { label: "Exhaust stroke", curve: t`P = \text{const}` },
    intake: { label: "Intake stroke", curve: t`P = \text{const}` },
  },

  symbols: [
    { tex: t`P`, name: "pressure", unit: "kPa" },
    { tex: t`T`, name: "temperature", unit: "K" },
    { tex: t`v`, name: "specific volume", unit: "m³/kg" },
    { tex: t`s`, name: "specific entropy, shown relative to state 1", unit: "kJ/kg·K" },
    { tex: t`k`, name: t`specific heat ratio $c_p/c_v$`, unit: "" },
    { tex: t`r`, name: t`compression ratio $v_1/v_2 = V_\text{max}/V_\text{min}$`, unit: "" },
    { tex: t`r_c`, name: t`cutoff ratio: volume ratio during constant-pressure heat addition`, unit: "" },
    { tex: t`r_p`, name: t`pressure ratio during constant-volume heat addition`, unit: "" },
    { tex: t`q_\text{in},\ q_\text{out}`, name: "heat added and heat rejected per unit mass", unit: "kJ/kg" },
    { tex: t`w_\text{net}`, name: "net work output per unit mass", unit: "kJ/kg" },
    { tex: t`\eta_\text{th}`, name: t`thermal efficiency $w_\text{net}/q_\text{in}$`, unit: "" },
    { tex: t`\text{MEP}`, name: t`mean effective pressure $w_\text{net}/(v_1 - v_2)$`, unit: "kPa" },
    { tex: t`\text{TDC, BDC}`, name: "top and bottom dead center: the piston positions of minimum and maximum volume", unit: "" },
  ],

  // -------------------------------------------------------------------- cycles
  cycles: {
    otto: {
      name: "Otto cycle",
      tagline: "The ideal cycle for spark-ignition (gasoline) engines",
      headHardware: "Spark plug",
      intro: {
        title: "State 1: start of compression",
        text: t`The piston is at bottom dead center (BDC), so the cylinder volume is at its maximum. The air is at its lowest pressure and temperature, $P_1$ and $T_1$. The compression ratio $r = v_1/v_2$ fixes how far the piston will squeeze it.`,
        equations: [
          { tex: t`v_1 = \frac{R\,T_1}{P_1}`, num: t`v_1 = \frac{(\val{R})(\val{T1})}{\val{P1}} = \val{v1}\ \text{m}^3\!/\text{kg}` },
          { tex: t`v_2 = \frac{v_1}{r}`, num: t`v_2 = \frac{\val{v1}}{\val{r}} = \val{v2}\ \text{m}^3\!/\text{kg}` },
        ],
      },
      processes: {
        "1-2": compression({
          engine: t`This is the compression stroke. Both valves are closed, and in a real engine the cylinder holds a mixture of fuel and air.`,
        }),
        "2-3": {
          title: "Constant-volume heat addition",
          what: t`Heat $q_\text{in}$ is added while the piston sits at TDC. The volume cannot change, so the pressure and the temperature shoot up together.`,
          engine: t`This models combustion. The spark plug ignites the mixture, and it burns so quickly that the piston has hardly moved by the time it is finished.`,
          energy: t`There is no boundary work at constant volume, so all of the heat goes into internal energy.`,
          trends: { P: "up", T: "up", v: "const", s: "up" },
          equations: [
            { tex: t`q_\text{in} = c_v\,(T_3 - T_2)\ \Rightarrow\ T_3 = T_2 + \frac{q_\text{in}}{c_v}`, num: t`T_3 = \val{T2} + \frac{\val{qin}}{\val{cv}} = \val{T3}\ \text{K}` },
            { tex: t`P_3 = P_2\,\frac{T_3}{T_2}`, num: t`P_3 = \val{P2}\,\frac{\val{T3}}{\val{T2}} = \val{P3}\ \text{kPa}` },
          ],
          notice: t`The P–v path is a vertical line with no area under it, so no work is done. On the T–s diagram the area under the curve is the heat added.`,
        },
        "3-4": {
          title: "Isentropic expansion",
          what: t`The hot, high-pressure gas pushes the piston from TDC back to BDC. The expansion is adiabatic and reversible, so the entropy is constant again.`,
          engine: t`This is the power stroke, the only part of the cycle in which the engine delivers work.`,
          energy: t`No heat is transferred. The gas does work on the piston at the expense of its internal energy, so it cools.`,
          trends: { P: "down", T: "down", v: "up", s: "const" },
          equations: [
            { tex: t`T_4 = T_3 \left(\frac{v_3}{v_4}\right)^{k-1} = \frac{T_3}{r^{\,k-1}}`, num: t`T_4 = \frac{\val{T3}}{(\val{r})^{\val{km1}}} = \val{T4}\ \text{K}` },
            { tex: t`w_{\text{out},3\text{-}4} = c_v\,(T_3 - T_4)`, num: t`w_{\text{out},3\text{-}4} = \val{cv}\,(\val{T3} - \val{T4}) = \val{w34}\ \text{kJ/kg}` },
          ],
          notice: t`More area lies under this curve than under the compression curve. The difference between the two is the net work of the cycle.`,
        },
        "4-1": heatRejection(),
      },
      summary: {
        title: "The whole cycle",
        text: t`The net work is the area enclosed by the cycle on either diagram. The thermal efficiency depends only on the compression ratio and $k$, not on how much heat is added.`,
        equations: [
          netWork,
          { tex: t`\eta_\text{th,Otto} = \frac{w_\text{net}}{q_\text{in}} = 1 - \frac{1}{r^{\,k-1}}`, num: t`\eta_\text{th,Otto} = 1 - \frac{1}{(\val{r})^{\val{km1}}} = \val{eta}` },
          mep,
        ],
        notice: t`Raise $r$ and watch the efficiency climb. Then change $q_\text{in}$: the cycle gets taller and the net work grows, but the efficiency does not move.`,
      },
    },

    diesel: {
      name: "Diesel cycle",
      tagline: "The ideal cycle for compression-ignition engines",
      headHardware: "Fuel injector",
      intro: {
        title: "State 1: start of compression",
        text: t`The piston is at BDC and the cylinder is full of air at $P_1$ and $T_1$. A diesel engine compresses air alone, so it can use a much higher compression ratio than a gasoline engine without the charge igniting too early.`,
        equations: [
          { tex: t`v_1 = \frac{R\,T_1}{P_1}`, num: t`v_1 = \frac{(\val{R})(\val{T1})}{\val{P1}} = \val{v1}\ \text{m}^3\!/\text{kg}` },
          { tex: t`v_2 = \frac{v_1}{r}`, num: t`v_2 = \frac{\val{v1}}{\val{r}} = \val{v2}\ \text{m}^3\!/\text{kg}` },
        ],
      },
      processes: {
        "1-2": compression({
          engine: t`This is the compression stroke. Only air is in the cylinder, and by the end of the stroke it is hotter than the autoignition temperature of the fuel.`,
          notice: t`Compare $T_2$ with the Otto cycle: the higher compression ratio gives a much hotter charge before any heat is added. On the T–s diagram the point climbs straight up.`,
        }),
        "2-3": {
          title: "Constant-pressure heat addition",
          what: t`Heat $q_\text{in}$ is added while the piston is already moving down. The gas expands from $v_2$ to $v_3$ at constant pressure. The cutoff ratio $r_c = v_3/v_2$ says how long the heat addition lasts.`,
          engine: t`Fuel is injected into the hot air starting at TDC and burns as it enters. Injection continues through the first part of the power stroke, which keeps the pressure roughly constant.`,
          energy: t`The heat does two things at once: it raises the internal energy of the gas and it does work on the piston. That is why $c_p$ appears here instead of $c_v$.`,
          trends: { P: "const", T: "up", v: "up", s: "up" },
          equations: [
            { tex: t`T_3 = T_2\,\frac{v_3}{v_2} = T_2\,r_c`, num: t`T_3 = (\val{T2})(\val{rc}) = \val{T3}\ \text{K}` },
            { tex: t`q_\text{in} = c_p\,(T_3 - T_2)`, num: t`q_\text{in} = \val{cp}\,(\val{T3} - \val{T2}) = \val{qin}\ \text{kJ/kg}` },
            { tex: t`w_{\text{out},2\text{-}3} = P_2\,(v_3 - v_2)`, num: t`w_{\text{out},2\text{-}3} = \val{P2}\,(\val{v3} - \val{v2}) = \val{wP}\ \text{kJ/kg}` },
          ],
          notice: t`The P–v path is horizontal and there is area under it: work is done during the heat addition. On the T–s diagram a constant-pressure curve is flatter than a constant-volume curve.`,
        },
        "3-4": {
          title: "Isentropic expansion",
          what: t`After the fuel is cut off, the gas keeps expanding at constant entropy until the piston reaches BDC.`,
          engine: t`This is the rest of the power stroke.`,
          energy: t`No heat is transferred. The gas does work on the piston at the expense of its internal energy, so it cools.`,
          trends: { P: "down", T: "down", v: "up", s: "const" },
          equations: [
            { tex: t`T_4 = T_3 \left(\frac{v_3}{v_4}\right)^{k-1} = T_3 \left(\frac{r_c}{r}\right)^{k-1}`, num: t`T_4 = \val{T3} \left(\frac{\val{rc}}{\val{r}}\right)^{\val{km1}} = \val{T4}\ \text{K}` },
            { tex: t`w_{\text{out},3\text{-}4} = c_v\,(T_3 - T_4)`, num: t`w_{\text{out},3\text{-}4} = \val{cv}\,(\val{T3} - \val{T4}) = \val{w34}\ \text{kJ/kg}` },
          ],
          notice: t`The expansion ratio $v_4/v_3 = r/r_c = \val{rexp}$ is smaller than the compression ratio. A larger cutoff ratio leaves less expansion to turn the heat into work.`,
        },
        "4-1": heatRejection(),
      },
      summary: {
        title: "The whole cycle",
        text: t`The term in brackets is always greater than 1, so for the same compression ratio a Diesel cycle is less efficient than an Otto cycle. Diesel engines win in practice because they run at much higher compression ratios.`,
        equations: [
          netWork,
          { tex: t`\eta_\text{th,Diesel} = 1 - \frac{1}{r^{\,k-1}} \left[ \frac{r_c^{\,k} - 1}{k\,(r_c - 1)} \right]`, num: t`\eta_\text{th,Diesel} = 1 - \frac{1}{(\val{r})^{\val{km1}}} \left[ \frac{(\val{rc})^{\val{k}} - 1}{\val{k}\,(\val{rc} - 1)} \right] = \val{eta}` },
          mep,
        ],
        notice: t`Lower $r_c$ toward 1 and watch the efficiency approach the Otto value for the same $r$.`,
      },
    },

    dual: {
      name: "Dual cycle",
      tagline: "Heat added partly at constant volume and partly at constant pressure",
      headHardware: "Fuel injector",
      intro: {
        title: "State 1: start of compression",
        text: t`Real combustion is neither instantaneous nor at constant pressure. The dual cycle splits the heat addition into a constant-volume part and a constant-pressure part, and it contains the Otto and Diesel cycles as its two limits. As before, the piston starts at BDC with air at $P_1$ and $T_1$.`,
        equations: [
          { tex: t`v_1 = \frac{R\,T_1}{P_1}`, num: t`v_1 = \frac{(\val{R})(\val{T1})}{\val{P1}} = \val{v1}\ \text{m}^3\!/\text{kg}` },
          { tex: t`v_2 = \frac{v_1}{r}`, num: t`v_2 = \frac{\val{v1}}{\val{r}} = \val{v2}\ \text{m}^3\!/\text{kg}` },
        ],
      },
      processes: {
        "1-2": compression(),
        "2-x": {
          title: "Constant-volume heat addition",
          what: t`The first part of the heat is added with the piston at TDC. The pressure and temperature rise at constant volume by the pressure ratio $r_p = P_x/P_2$.`,
          engine: t`This represents the rapid burning of the fuel that is already in the cylinder when combustion starts.`,
          energy: t`No work is done, so this part of the heat goes entirely into internal energy.`,
          trends: { P: "up", T: "up", v: "const", s: "up" },
          equations: [
            { tex: t`P_x = r_p\,P_2 \qquad T_x = r_p\,T_2`, num: t`T_x = (\val{rp})(\val{T2}) = \val{Tx}\ \text{K}` },
            { tex: t`q_{\text{in},v} = c_v\,(T_x - T_2)`, num: t`q_{\text{in},v} = \val{cv}\,(\val{Tx} - \val{T2}) = \val{qV}\ \text{kJ/kg}` },
          ],
          notice: t`Set $r_c = 1$ and this is the whole heat addition: the dual cycle becomes an Otto cycle.`,
        },
        "x-3": {
          title: "Constant-pressure heat addition",
          what: t`The rest of the heat is added at constant pressure while the piston moves down, until the volume reaches $v_3 = r_c\,v_x$.`,
          engine: t`This represents fuel that burns as it is injected during the start of the power stroke.`,
          energy: t`This part of the heat raises the internal energy and does work on the piston at the same time.`,
          trends: { P: "const", T: "up", v: "up", s: "up" },
          equations: [
            { tex: t`T_3 = T_x\,\frac{v_3}{v_x} = T_x\,r_c`, num: t`T_3 = (\val{Tx})(\val{rc}) = \val{T3}\ \text{K}` },
            { tex: t`q_{\text{in},p} = c_p\,(T_3 - T_x)`, num: t`q_{\text{in},p} = \val{cp}\,(\val{T3} - \val{Tx}) = \val{qP}\ \text{kJ/kg}` },
            { tex: t`w_{\text{out},x\text{-}3} = P_x\,(v_3 - v_x)`, num: t`w_{\text{out},x\text{-}3} = \val{Px}\,(\val{v3} - \val{vx}) = \val{wP}\ \text{kJ/kg}` },
          ],
          notice: t`Set $r_p = 1$ and only this part remains: the dual cycle becomes a Diesel cycle.`,
        },
        "3-4": {
          title: "Isentropic expansion",
          what: t`With the heat addition over, the gas expands at constant entropy until the piston reaches BDC.`,
          engine: t`This is the rest of the power stroke.`,
          energy: t`No heat is transferred. The gas does work on the piston at the expense of its internal energy, so it cools.`,
          trends: { P: "down", T: "down", v: "up", s: "const" },
          equations: [
            { tex: t`T_4 = T_3 \left(\frac{v_3}{v_4}\right)^{k-1} = T_3 \left(\frac{r_c}{r}\right)^{k-1}`, num: t`T_4 = \val{T3} \left(\frac{\val{rc}}{\val{r}}\right)^{\val{km1}} = \val{T4}\ \text{K}` },
            { tex: t`w_{\text{out},3\text{-}4} = c_v\,(T_3 - T_4)`, num: t`w_{\text{out},3\text{-}4} = \val{cv}\,(\val{T3} - \val{T4}) = \val{w34}\ \text{kJ/kg}` },
          ],
          notice: t`As in the Diesel cycle, the gas expands by the ratio $r/r_c = \val{rexp}$, which is less than the compression ratio.`,
        },
        "4-1": heatRejection(),
      },
      summary: {
        title: "The whole cycle",
        text: t`For the same compression ratio and heat input, the efficiency of the dual cycle lies between the Diesel cycle (all heat at constant pressure) and the Otto cycle (all heat at constant volume).`,
        equations: [
          { tex: t`q_\text{in} = c_v\,(T_x - T_2) + c_p\,(T_3 - T_x)`, num: t`q_\text{in} = \val{qV} + \val{qP} = \val{qin}\ \text{kJ/kg}` },
          netWork,
          { tex: t`\eta_\text{th,dual} = 1 - \frac{1}{r^{\,k-1}} \left[ \frac{r_p\,r_c^{\,k} - 1}{(r_p - 1) + k\,r_p\,(r_c - 1)} \right]`, num: t`\eta_\text{th,dual} = \val{eta}` },
          mep,
        ],
        notice: t`Slide $r_c$ down to 1 and then $r_p$ down to 1, and watch the efficiency formula turn into the Otto and Diesel formulas.`,
      },
    },
  },

  // ------------------------------------------- optional intake / exhaust strokes
  strokes: {
    note: t`During these two strokes the cylinder is an open system. The horizontal axis of the P–v diagram shows the cylinder volume per unit mass of the trapped air.`,
    "1-0": {
      title: "Exhaust stroke",
      what: t`The exhaust valve opens and the piston moves from BDC to TDC, pushing the gas out at constant pressure $P_1$. The amount of gas in the cylinder changes, but its pressure and temperature do not.`,
      engine: t`This is the exhaust stroke of a four-stroke engine.`,
      energy: t`The piston does work on the gas to push it out.`,
      trends: { P: "const", T: "const", v: "const", s: "const" },
      equations: [
        { tex: t`w_{\text{in},1\text{-}0} = P_1\,(v_1 - v_2)`, num: t`w_{\text{in},1\text{-}0} = \val{P1}\,(\val{v1} - \val{v2}) = \val{wstroke}\ \text{kJ/kg}` },
      ],
      notice: t`On the T–s diagram the point stays at state 1, because the properties of the gas inside the cylinder are not changing.`,
    },
    "0-1": {
      title: "Intake stroke",
      what: t`The intake valve opens and the piston moves from TDC to BDC, drawing in a fresh charge at $P_1$ and $T_1$.`,
      engine: t`This is the intake stroke of a four-stroke engine.`,
      energy: t`The incoming gas does work on the piston, exactly the amount that was spent on the exhaust stroke. The two cancel, which is why the air-standard analysis leaves these strokes out.`,
      trends: { P: "const", T: "const", v: "const", s: "const" },
      equations: [
        { tex: t`w_{\text{out},0\text{-}1} = P_1\,(v_1 - v_2)`, num: t`w_{\text{out},0\text{-}1} = \val{P1}\,(\val{v1} - \val{v2}) = \val{wstroke}\ \text{kJ/kg}` },
      ],
      notice: t`The line 1–0–1 on the P–v diagram is traced out and back, so it encloses no area and adds no net work.`,
    },
  },

  // -------------------------------------------------------------- compare mode
  compare: {
    independent: {
      label: "Nothing (set each cycle freely)",
      takeaway: t`Each cycle has its own settings. Both start from the same state 1, so differences between the curves come from the settings you chose.`,
    },
    "same-r-qin": {
      label: "Compression ratio and heat input",
      takeaway: t`With the same compression ratio and the same heat input, the more heat a cycle adds at constant volume, the more efficient it is: Otto > dual > Diesel. On the T–s diagram both cycles have the same area under their heat-addition curves, and the cycle that ends at the lower entropy rejects less heat along 4–1.`,
    },
    "same-pmax-qin": {
      label: "Peak pressure and heat input",
      takeaway: t`A real engine is limited by the peak pressure its parts can withstand. With the same peak pressure and heat input the ranking flips: Diesel > dual > Otto. The Diesel cycle can use a much higher compression ratio before it reaches the pressure limit, so it rejects less heat.`,
    },
  },
};
