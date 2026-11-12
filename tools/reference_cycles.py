#!/usr/bin/env python3
"""
Independent reference implementation of the model described in docs/PHYSICS.md.

Writes tests/fixtures/reference-cycles.json, which is the oracle for the
JavaScript core in site/js/core. It is deliberately a separate implementation in
another language, so the two check each other.

Run from the repo root:

    python3 tools/reference_cycles.py

Units everywhere: kPa, K, m^3/kg, kJ/kg, kJ/(kg.K), radians.
Sign convention for process energies: q > 0 is heat TO the gas, w > 0 is work
done BY the gas, and q - w = du.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

R_AIR = 0.287      # kJ/(kg.K)
RHO = 3.0          # connecting-rod length / crank radius
STROKE_S = 2.4     # seconds per piston stroke at 1x speed
DWELL_S = 1.4      # seconds per constant-volume process at 1x speed
EPS = 1e-9

# id, kind, role, from-state, to-state
PROCESS_TABLE = {
    "otto": [
        ("1-2", "isentropic", "compression", "1", "2"),
        ("2-3", "constV", "heatAdditionV", "2", "3"),
        ("3-4", "isentropic", "expansion", "3", "4"),
        ("4-1", "constV", "heatRejection", "4", "1"),
    ],
    "diesel": [
        ("1-2", "isentropic", "compression", "1", "2"),
        ("2-3", "constP", "heatAdditionP", "2", "3"),
        ("3-4", "isentropic", "expansion", "3", "4"),
        ("4-1", "constV", "heatRejection", "4", "1"),
    ],
    "dual": [
        ("1-2", "isentropic", "compression", "1", "2"),
        ("2-x", "constV", "heatAdditionV", "2", "x"),
        ("x-3", "constP", "heatAdditionP", "x", "3"),
        ("3-4", "isentropic", "expansion", "3", "4"),
        ("4-1", "constV", "heatRejection", "4", "1"),
    ],
}


# ---------------------------------------------------------------- gas + cycle

def make_gas(k=1.4, R=R_AIR):
    cv = R / (k - 1.0)
    return {"k": k, "R": R, "cv": cv, "cp": k * cv}


def ratios_for(cycle_type, params, T1, gas):
    """Native inputs of each cycle type -> canonical ratios {r, rp, rc}."""
    r = params["r"]
    if cycle_type == "otto":
        T2 = T1 * r ** (gas["k"] - 1.0)
        return {"r": r, "rp": 1.0 + params["qin"] / (gas["cv"] * T2), "rc": 1.0}
    if cycle_type == "diesel":
        return {"r": r, "rp": 1.0, "rc": params["rc"]}
    return {"r": r, "rp": params["rp"], "rc": params["rc"]}


def ratios_from_heat(r, qin, xv, T1, gas):
    """Ratios for a given heat input, a fraction xv of it at constant volume."""
    T2 = T1 * r ** (gas["k"] - 1.0)
    rp = 1.0 + xv * qin / (gas["cv"] * T2)
    rc = 1.0 + (1.0 - xv) * qin / (gas["cp"] * rp * T2)
    return {"r": r, "rp": rp, "rc": rc}


def solve_r_for_pmax(Pmax, qin, xv, P1, T1, gas):
    """Compression ratio that gives peak pressure Pmax for heat input qin."""
    k, cv = gas["k"], gas["cv"]

    def f(r):
        return P1 * (r ** k + xv * qin * r / (cv * T1)) - Pmax

    lo, hi = 1.0, (Pmax / P1) ** (1.0 / k)
    if f(lo) > 0.0:
        raise ValueError("Pmax too low for this heat input")
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if f(mid) > 0.0:
            hi = mid
        else:
            lo = mid
    return 0.5 * (lo + hi)


def eta_closed_form(r, rp, rc, k):
    den = (rp - 1.0) + k * rp * (rc - 1.0)
    return 1.0 - r ** (1.0 - k) * (rp * rc ** k - 1.0) / den


def solve_cycle(cycle_type, P1, T1, r, rp, rc, gas):
    k, R, cv, cp = gas["k"], gas["R"], gas["cv"], gas["cp"]
    v1 = R * T1 / P1
    v2 = v1 / r
    T2, P2 = T1 * r ** (k - 1.0), P1 * r ** k
    Tx, Px, vx = rp * T2, rp * P2, v2
    T3, P3, v3 = rc * Tx, Px, rc * vx
    T4, P4, v4 = T3 * (v3 / v1) ** (k - 1.0), P3 * (v3 / v1) ** k, v1
    s1 = s2 = 0.0
    sx = s2 + cv * math.log(Tx / T2)
    s3 = sx + cp * math.log(T3 / Tx)
    s4 = s3
    states = {
        "1": {"P": P1, "T": T1, "v": v1, "s": s1},
        "2": {"P": P2, "T": T2, "v": v2, "s": s2},
        "x": {"P": Px, "T": Tx, "v": vx, "s": sx},
        "3": {"P": P3, "T": T3, "v": v3, "s": s3},
        "4": {"P": P4, "T": T4, "v": v4, "s": s4},
    }
    processes = []
    for pid, kind, role, a, b in PROCESS_TABLE[cycle_type]:
        A, B = states[a], states[b]
        if kind == "isentropic":
            q, w = 0.0, cv * (A["T"] - B["T"])
        elif kind == "constV":
            q, w = cv * (B["T"] - A["T"]), 0.0
        else:
            q, w = cp * (B["T"] - A["T"]), A["P"] * (B["v"] - A["v"])
        degenerate = role.startswith("heatAddition") and abs(B["T"] - A["T"]) <= EPS * A["T"]
        processes.append({"id": pid, "kind": kind, "role": role, "from": a, "to": b,
                          "q": q, "w": w, "du": cv * (B["T"] - A["T"]), "degenerate": degenerate})
    qin = sum(p["q"] for p in processes if p["q"] > 0.0)
    qout = -sum(p["q"] for p in processes if p["q"] < 0.0)
    wnet = sum(p["w"] for p in processes)
    metrics = {
        "qin": qin, "qout": qout, "wnet": wnet,
        "eta": wnet / qin, "mep": wnet / (v1 - v2),
        "Tmax": T3, "Pmax": P3, "etaCarnot": 1.0 - T1 / T3,
        "win": -sum(p["w"] for p in processes if p["w"] < 0.0),
        "wout": sum(p["w"] for p in processes if p["w"] > 0.0),
    }
    sol = {"type": cycle_type, "gas": gas,
           "inputs": {"P1": P1, "T1": T1, "r": r, "rp": rp, "rc": rc},
           "states": states, "processes": processes, "metrics": metrics}
    check_cycle(sol)
    return sol


def check_cycle(sol):
    g, m, st = sol["gas"], sol["metrics"], sol["states"]
    i = sol["inputs"]
    for s in st.values():
        assert math.isclose(s["P"] * s["v"], g["R"] * s["T"], rel_tol=1e-12)
    assert math.isclose(sum(p["q"] for p in sol["processes"]), m["wnet"], rel_tol=1e-10)
    assert abs(sum(p["du"] for p in sol["processes"])) < 1e-9
    for p in sol["processes"]:
        assert abs(p["q"] - p["w"] - p["du"]) < 1e-9
    assert math.isclose(m["eta"], eta_closed_form(i["r"], i["rp"], i["rc"], g["k"]), rel_tol=1e-10)
    # entropy closes: going 4 -> 1 at constant volume returns to s1 = 0
    assert abs(st["4"]["s"] + g["cv"] * math.log(st["1"]["T"] / st["4"]["T"])) < 1e-10
    assert math.isclose(st["4"]["T"], i["rp"] * i["rc"] ** g["k"] * i["T1"], rel_tol=1e-12)


# ---------------------------------------------------------------------- paths

def process_by_id(sol, pid):
    return next(p for p in sol["processes"] if p["id"] == pid)


def point_on_process(sol, pid, lam):
    """lam in [0,1]: linear in v for volume-changing processes, linear in T for constV."""
    g = sol["gas"]
    p = process_by_id(sol, pid)
    A, B = sol["states"][p["from"]], sol["states"][p["to"]]
    if p["kind"] == "constV":
        T = A["T"] + lam * (B["T"] - A["T"])
        return {"P": A["P"] * T / A["T"], "T": T, "v": A["v"],
                "s": A["s"] + g["cv"] * math.log(T / A["T"])}
    v = A["v"] + lam * (B["v"] - A["v"])
    if p["kind"] == "constP":
        T = A["T"] * v / A["v"]
        return {"P": A["P"], "T": T, "v": v, "s": A["s"] + g["cp"] * math.log(T / A["T"])}
    return {"P": A["P"] * (A["v"] / v) ** g["k"], "T": A["T"] * (A["v"] / v) ** (g["k"] - 1.0),
            "v": v, "s": A["s"]}


def energy_along(sol, pid, state):
    """Running signed q, w, du from the start of process pid to `state`."""
    g = sol["gas"]
    p = process_by_id(sol, pid)
    A = sol["states"][p["from"]]
    du = g["cv"] * (state["T"] - A["T"])
    if p["kind"] == "isentropic":
        return {"q": 0.0, "w": -du, "du": du}
    if p["kind"] == "constV":
        return {"q": du, "w": 0.0, "du": du}
    return {"q": g["cp"] * (state["T"] - A["T"]), "w": A["P"] * (state["v"] - A["v"]), "du": du}


# ----------------------------------------------------------------- kinematics

def xhat(theta, rho=RHO):
    """Piston position: 0 at TDC (theta = 0), 1 at BDC (theta = pi)."""
    return ((1.0 - math.cos(theta)) + rho - math.sqrt(rho * rho - math.sin(theta) ** 2)) / 2.0


def theta_from_xhat(x, rho=RHO):
    """Inverse of xhat on the down-stroke branch, theta in [0, pi]."""
    d = rho + 1.0 - 2.0 * x
    c = (1.0 + d * d - rho * rho) / (2.0 * d)
    return math.acos(max(-1.0, min(1.0, c)))


def smoothstep(t):
    return t * t * (3.0 - 2.0 * t)


# ------------------------------------------------------------------- timeline
#
# The master timeline is a fixed sequence of slots, one process per slot:
#   C  isentropic compression      (piston BDC -> TDC)
#   HV constant-volume heat addition (piston dwells at TDC)
#   HP constant-pressure heat addition (piston TDC -> position of state 3)
#   E  isentropic expansion        (piston -> BDC)
#   R  constant-volume heat rejection (piston dwells at BDC)
#   X  exhaust stroke, I intake stroke (only when the strokes are shown)
# A slot has zero length when the cycle has no such process, unless it is forced
# (compare mode: the other cycle has it), in which case this cycle waits.

SLOT_ORDER = ["C", "HV", "HP", "E", "R", "X", "I"]
SLOT_SECONDS = {"C": STROKE_S, "HV": DWELL_S, "HP": DWELL_S, "E": STROKE_S,
                "R": DWELL_S, "X": STROKE_S, "I": STROKE_S}
ROLE_SLOT = {"compression": "C", "heatAdditionV": "HV", "heatAdditionP": "HP",
             "expansion": "E", "heatRejection": "R"}


def slot_processes(sol):
    """Slot id -> process id, for the non-degenerate processes of this cycle."""
    return {ROLE_SLOT[p["role"]]: p["id"] for p in sol["processes"] if not p["degenerate"]}


def build_timeline(sol, strokes=False, force=()):
    own = slot_processes(sol)
    slots, t = [], 0.0
    for sid in SLOT_ORDER:
        if sid in ("X", "I"):
            on = strokes
        else:
            on = sid in own or sid in force
        d = SLOT_SECONDS[sid] if on else 0.0
        slots.append({"id": sid, "processId": own.get(sid), "seconds": d, "t0": t})
        t += d
    for s in slots:
        s["u0"], s["u1"] = s.pop("t0") / t, 0.0
        s["u1"] = s["u0"] + s["seconds"] / t
    return {"slots": slots, "totalSeconds": t}


def frame_at(sol, tl, u):
    st = sol["states"]
    v1, v2, v3 = st["1"]["v"], st["2"]["v"], st["3"]["v"]
    own = slot_processes(sol)
    theta3 = theta_from_xhat((v3 - v2) / (v1 - v2)) if "HP" in own else 0.0

    u = u % 1.0
    slot = next(s for s in tl["slots"] if s["u1"] > s["u0"] and s["u0"] <= u < s["u1"])
    sid = slot["id"]
    tau = (u - slot["u0"]) / (slot["u1"] - slot["u0"])
    f = {"phase": u, "slot": sid, "tau": tau, "massFraction": 1.0, "waiting": False}

    if sid == "C":
        theta = math.pi + tau * math.pi
        xh = xhat(theta)
        pid, lam = "1-2", 1.0 - xh
        state = point_on_process(sol, pid, lam)
    elif sid == "HV":
        theta, xh = 0.0, 0.0
        if "HV" in own:
            pid, lam = own["HV"], smoothstep(tau)
            state = point_on_process(sol, pid, lam)
        else:  # forced slot: wait at state 2
            pid, lam, state = "1-2", 1.0, dict(st["2"])
            f["waiting"] = True
    elif sid == "HP":
        if "HP" in own:
            theta = tau * theta3
            xh = xhat(theta)
            pid = own["HP"]
            lam = ((v2 + (v1 - v2) * xh) - v2) / (v3 - v2)
            state = point_on_process(sol, pid, lam)
        else:  # forced slot: wait at state 3 (the end of whatever came before)
            theta, xh = 0.0, 0.0
            pid, lam, state = own.get("HV", "1-2"), 1.0, dict(st["3"])
            f["waiting"] = True
    elif sid == "E":
        theta = theta3 + tau * (math.pi - theta3)
        xh = xhat(theta)
        pid = "3-4"
        lam = ((v2 + (v1 - v2) * xh) - v3) / (v1 - v3)
        state = point_on_process(sol, pid, lam)
    elif sid == "R":
        theta, xh = math.pi, 1.0
        pid, lam = "4-1", smoothstep(tau)
        state = point_on_process(sol, pid, lam)
    elif sid == "X":
        theta = math.pi + tau * math.pi
        xh = xhat(theta)
        pid, lam, state = "1-0", 1.0 - xh, dict(st["1"])
    else:  # "I"
        theta = tau * math.pi
        xh = xhat(theta)
        pid, lam, state = "0-1", xh, dict(st["1"])

    v_cyl = v2 + (v1 - v2) * xh
    if sid in ("X", "I"):
        f["massFraction"] = v_cyl / v1
        dv = (v_cyl - v1) if sid == "X" else (v_cyl - v2)
        energy = {"q": 0.0, "w": st["1"]["P"] * dv, "du": 0.0}
    else:
        energy = energy_along(sol, pid, state)
    f.update({"processId": pid, "lambda": lam, "state": state, "theta": theta,
              "xhat": xh, "vCyl": v_cyl, "energy": energy})
    return f


def state_phases(tl):
    """Phase at which the cycle reaches each state (slot boundaries)."""
    s = {x["id"]: x for x in tl["slots"]}
    out = {"1": 0.0, "2": s["C"]["u1"], "x": s["HV"]["u1"], "3": s["HP"]["u1"],
           "4": s["E"]["u1"], "1end": s["R"]["u1"]}
    if s["X"]["seconds"] > 0:
        out["0"] = s["X"]["u1"]
    return out


# -------------------------------------------------------------------- fixture

CASES = [
    ("otto-default", "otto", {"r": 8, "qin": 800}, 100, 300, 1.4),
    ("diesel-default", "diesel", {"r": 18, "rc": 2}, 100, 300, 1.4),
    ("dual-default", "dual", {"r": 16, "rp": 1.5, "rc": 1.5}, 100, 300, 1.4),
    ("otto-290K", "otto", {"r": 8, "qin": 800}, 100, 290, 1.4),
    ("otto-monatomic", "otto", {"r": 10, "qin": 600}, 100, 300, 5.0 / 3.0),
    ("diesel-offdesign", "diesel", {"r": 20, "rc": 3}, 95, 320, 1.35),
    ("dual-as-otto", "dual", {"r": 9, "rp": 2.5, "rc": 1.0}, 100, 300, 1.4),
    ("dual-as-diesel", "dual", {"r": 18, "rp": 1.0, "rc": 2.0}, 100, 300, 1.4),
    ("dual-high", "dual", {"r": 22, "rp": 1.2, "rc": 2.4}, 110, 310, 1.3),
]


def build_case(name, cycle_type, params, P1, T1, k):
    gas = make_gas(k)
    rat = ratios_for(cycle_type, params, T1, gas)
    sol = solve_cycle(cycle_type, P1, T1, rat["r"], rat["rp"], rat["rc"], gas)
    mids = []
    for p in sol["processes"]:
        for lam in (0.25, 0.5, 0.75):
            pt = point_on_process(sol, p["id"], lam)
            mids.append({"process": p["id"], "lambda": lam, **pt,
                         "energy": energy_along(sol, p["id"], pt)})
    return sol, {
        "name": name,
        "spec": {"type": cycle_type, "P1": P1, "T1": T1, "k": k, "R": R_AIR, "params": params},
        "gas": gas, "ratios": rat, "states": sol["states"],
        "processes": sol["processes"], "metrics": sol["metrics"], "midpoints": mids,
    }


def timeline_block(name, sol, strokes=False, force=()):
    tl = build_timeline(sol, strokes, force)
    n = 24 if strokes else 16
    frames = [frame_at(sol, tl, (j + 0.5) / n) for j in range(n)]
    for a, b in zip(frames, frames[1:]):   # no sample may sit on a slot boundary
        assert a["phase"] < b["phase"]
    # the cycle is continuous across every slot boundary
    for s in tl["slots"]:
        if s["seconds"] > 0:
            lo, hi = frame_at(sol, tl, s["u0"] + 1e-12), frame_at(sol, tl, s["u1"] - 1e-12)
            for other in tl["slots"]:
                if other["seconds"] > 0 and abs(other["u0"] - s["u1"]) < 1e-12:
                    nxt = frame_at(sol, tl, other["u0"] + 1e-12)
                    for key in ("P", "T", "v"):
                        assert math.isclose(hi["state"][key], nxt["state"][key], rel_tol=1e-6), (name, s["id"], key)
                    assert math.isclose(hi["xhat"], nxt["xhat"], abs_tol=1e-6)
    return {"case": name, "strokes": strokes, "force": list(force),
            "timeline": tl, "statePhases": state_phases(tl), "frames": frames}


def main():
    sols, cycles = {}, []
    for case in CASES:
        sol, block = build_case(*case)
        sols[case[0]] = sol
        cycles.append(block)

    gas = make_gas(1.4)
    P1, T1 = 100.0, 300.0
    compare = []
    for xv_a, type_a, xv_b, type_b in ((1.0, "otto", 0.0, "diesel"), (1.0, "otto", 0.5, "dual")):
        r, qin = 12.0, 1000.0
        sides = []
        for xv, t in ((xv_a, type_a), (xv_b, type_b)):
            rat = ratios_from_heat(r, qin, xv, T1, gas)
            s = solve_cycle(t, P1, T1, rat["r"], rat["rp"], rat["rc"], gas)
            assert math.isclose(s["metrics"]["qin"], qin, rel_tol=1e-10)
            sides.append({"type": t, "xv": xv, "ratios": rat, "metrics": s["metrics"]})
        compare.append({"constraint": "same-r-qin", "P1": P1, "T1": T1, "k": 1.4,
                        "r": r, "qin": qin, "sides": sides})
    for xv_a, type_a, xv_b, type_b in ((1.0, "otto", 0.0, "diesel"), (0.5, "dual", 0.0, "diesel")):
        Pmax, qin = 7000.0, 1000.0
        sides = []
        for xv, t in ((xv_a, type_a), (xv_b, type_b)):
            r = solve_r_for_pmax(Pmax, qin, xv, P1, T1, gas)
            rat = ratios_from_heat(r, qin, xv, T1, gas)
            s = solve_cycle(t, P1, T1, rat["r"], rat["rp"], rat["rc"], gas)
            assert math.isclose(s["metrics"]["Pmax"], Pmax, rel_tol=1e-9)
            assert math.isclose(s["metrics"]["qin"], qin, rel_tol=1e-9)
            sides.append({"type": t, "xv": xv, "ratios": rat, "metrics": s["metrics"]})
        compare.append({"constraint": "same-pmax-qin", "P1": P1, "T1": T1, "k": 1.4,
                        "Pmax": Pmax, "qin": qin, "sides": sides})

    efficiency = []
    for k in (1.3, 1.4, 5.0 / 3.0):
        for r in (4, 8, 12, 18, 24):
            efficiency.append({"fn": "otto", "r": r, "k": k, "eta": 1.0 - r ** (1.0 - k)})
            for rc in (1.5, 2, 3, 4):
                efficiency.append({"fn": "diesel", "r": r, "rc": rc, "k": k,
                                   "eta": eta_closed_form(r, 1.0, rc, k)})
            efficiency.append({"fn": "dual", "r": r, "rp": 1.5, "rc": 1.5, "k": k,
                               "eta": eta_closed_form(r, 1.5, 1.5, k)})

    kin = {"rho": RHO, "samples": []}
    for deg in range(0, 361, 15):
        th = math.radians(deg)
        x = xhat(th)
        back = theta_from_xhat(x)
        assert math.isclose(back, th if deg <= 180 else 2 * math.pi - th, abs_tol=1e-7)
        kin["samples"].append({"thetaDeg": deg, "theta": th, "xhat": x})

    timelines = [
        timeline_block("otto-default", sols["otto-default"]),
        timeline_block("diesel-default", sols["diesel-default"]),
        timeline_block("dual-default", sols["dual-default"]),
        timeline_block("otto-default", sols["otto-default"], strokes=True),
        timeline_block("diesel-default", sols["diesel-default"], strokes=True),
        # compare mode: each cycle waits through the slot only the other one has
        timeline_block("otto-default", sols["otto-default"], force=("HP",)),
        timeline_block("diesel-default", sols["diesel-default"], force=("HV",)),
        timeline_block("dual-as-otto", sols["dual-as-otto"]),
        timeline_block("dual-as-diesel", sols["dual-as-diesel"]),
    ]

    fixture = {
        "meta": {
            "generator": "tools/reference_cycles.py",
            "units": "kPa, K, m^3/kg, kJ/kg, kJ/(kg.K), rad",
            "signs": "q > 0 heat to gas; w > 0 work by gas; q - w = du",
            "constants": {"R": R_AIR, "rho": RHO, "strokeSeconds": STROKE_S,
                          "dwellSeconds": DWELL_S, "eps": EPS},
            "tolerance": "compare with relative tolerance 1e-9 (absolute 1e-9 near zero)",
        },
        "cycles": cycles, "compare": compare, "efficiency": efficiency,
        "kinematics": kin, "timelines": timelines,
    }
    out = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "reference-cycles.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fixture, indent=1) + "\n")
    print(f"wrote {out.relative_to(out.parent.parent.parent)}  ({out.stat().st_size / 1024:.0f} kB)\n")

    hdr = f"{'case':17}{'r':>6}{'rp':>8}{'rc':>7}{'T2':>8}{'T3':>8}{'T4':>8}{'P3':>9}{'qin':>8}{'qout':>8}{'wnet':>8}{'eta%':>7}{'MEP':>8}"
    print(hdr)
    for c in cycles:
        s, m, rt = c["states"], c["metrics"], c["ratios"]
        print(f"{c['name']:17}{rt['r']:6.1f}{rt['rp']:8.4f}{rt['rc']:7.3f}{s['2']['T']:8.1f}{s['3']['T']:8.1f}"
              f"{s['4']['T']:8.1f}{s['3']['P']:9.1f}{m['qin']:8.1f}{m['qout']:8.1f}{m['wnet']:8.1f}"
              f"{100 * m['eta']:7.2f}{m['mep']:8.1f}")
    print()
    for c in compare:
        key = "r" if c["constraint"] == "same-r-qin" else "Pmax"
        for sd in c["sides"]:
            rt, m = sd["ratios"], sd["metrics"]
            print(f"{c['constraint']:14} {key}={c[key]:<7g} qin={c['qin']:<6g} {sd['type']:7} xv={sd['xv']:<4g}"
                  f" r={rt['r']:7.3f} rp={rt['rp']:6.3f} rc={rt['rc']:6.3f} Tmax={m['Tmax']:7.1f}"
                  f" Pmax={m['Pmax']:8.1f} eta={100 * m['eta']:6.2f}%")
    print()
    for t in timelines:
        sp = ", ".join(f"{k}:{v:.4f}" for k, v in t["statePhases"].items())
        print(f"{t['case']:15} strokes={t['strokes']!s:5} force={','.join(t['force']) or '-':3} total={t['timeline']['totalSeconds']:5.1f}s  {sp}")
    print(f"\nxhat(90 deg) = {xhat(math.pi / 2):.6f}   rho = {RHO}")


if __name__ == "__main__":
    main()
