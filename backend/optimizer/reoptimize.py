"""
CP-SAT re-planning engine (master spec Section 5 / deep-dive Section 8).

Two real decisions in one solve:
  1. Headway hold: how many minutes to hold each downstream-conflicting train
     at its current station to restore minimum separation (minimize total hold).
  2. Bus/EV diversion: which buses from the depot fleet absorb the stranded
     load on the affected segment, preferring EV over diesel (greener),
     subject to real capacity + depot-proximity + charger-availability constraints.

CP-SAT guarantees a feasible answer respects every constraint, or reports
infeasible -- see deep-dive Section 8 for why this is a solver problem, not
an ML problem.
"""
from dataclasses import dataclass, field
from ortools.sat.python import cp_model

DIESEL_CO2_KG_PER_KM = 1.2
EV_CO2_KG_PER_KM = 0.3
AVG_DIVERSION_KM = 4.0
STRANDED_LOAD_PASSENGERS = 120
DEPOT_PROXIMITY_SEGMENTS = 3


@dataclass
class Plan:
    feasible: bool
    hold_adjustments: dict = field(default_factory=dict)      # train_id -> hold minutes
    buses_assigned: list = field(default_factory=list)        # list of bus ids
    ev_used: int = 0
    diesel_used: int = 0
    co2_avoided_kg: float = 0.0
    constraint_trace: list = field(default_factory=list)      # human-readable "why" lines


def _segment_distance(corridor_segments, seg_a_id, seg_b_id) -> int:
    order = {s["id"]: i for i, s in enumerate(corridor_segments)}
    if seg_a_id not in order or seg_b_id not in order:
        return 999
    return abs(order[seg_a_id] - order[seg_b_id])


def solve_plan(
    conflicts: list[dict],
    affected_segment_id: str,
    corridor_segments: list[dict],
    buses: list[dict],
    chargers: list[dict],
    stations_by_code: dict,
    road_available: bool = True,
) -> Plan:
    model = cp_model.CpModel()
    trace = []

    # ---- Decision set 1: headway holds ----
    hold_vars = {}
    for c in conflicts:
        needed = int(round(c["inherited_delay_min"]))
        v = model.NewIntVar(0, max(needed, 0) + 10, f"hold_{c['train_id']}")
        model.Add(v >= needed)
        hold_vars[c["train_id"]] = v
    total_hold = sum(hold_vars.values()) if hold_vars else 0

    # ---- Decision set 2: bus assignment ----
    # eligible buses: depot within N segments of the affected segment
    def depot_segment_id(depot_code):
        for seg in corridor_segments:
            if seg["from"] == depot_code or seg["to"] == depot_code:
                return seg["id"]
        return None

    eligible = []
    if road_available:  # a closed parallel road means buses simply cannot run this diversion
        for b in buses:
            if not b["driver_on_shift"]:
                continue
            dseg = depot_segment_id(b["depot_code"])
            if dseg and _segment_distance(corridor_segments, dseg, affected_segment_id) <= DEPOT_PROXIMITY_SEGMENTS:
                eligible.append(b)
    else:
        trace.append("Parallel road is closed - bus diversion is unavailable, so this plan holds trains instead.")

    assign_vars = {b["id"]: model.NewBoolVar(f"assign_{b['id']}") for b in eligible}

    total_capacity = sum(b["capacity"] for b in eligible)
    target_load = min(STRANDED_LOAD_PASSENGERS, total_capacity)
    if eligible:
        model.Add(sum(assign_vars[b["id"]] * b["capacity"] for b in eligible) >= target_load)

    # charger feasibility: EV buses assigned from the same depot can't exceed free bays
    charger_by_station = {c["station_code"]: c for c in chargers}
    for depot_code in {b["depot_code"] for b in eligible}:
        ev_here = [b for b in eligible if b["depot_code"] == depot_code and b["type"] == "EV"]
        if not ev_here:
            continue
        charger = charger_by_station.get(depot_code)
        free_bays = (charger["bays"] - charger["occupied_bays"]) if charger else 0
        model.Add(sum(assign_vars[b["id"]] for b in ev_here) <= max(free_bays, 0))

    # Objective: prefer EV over diesel (greener), and use fewer buses overall (efficient)
    cost_terms = []
    for b in eligible:
        weight = 1 if b["type"] == "EV" else 3
        cost_terms.append(weight * assign_vars[b["id"]])
    bus_cost = sum(cost_terms) if cost_terms else 0
    model.Minimize(bus_cost * 10 + total_hold)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return Plan(feasible=False, constraint_trace=["No feasible plan: insufficient eligible buses or charger capacity."])

    hold_adjustments = {tid: solver.Value(v) for tid, v in hold_vars.items()}
    assigned = [b["id"] for b in eligible if solver.Value(assign_vars[b["id"]]) == 1]
    assigned_buses = [b for b in eligible if b["id"] in assigned]
    ev_used = sum(1 for b in assigned_buses if b["type"] == "EV")
    diesel_used = sum(1 for b in assigned_buses if b["type"] == "diesel")
    co2_avoided = ev_used * (DIESEL_CO2_KG_PER_KM - EV_CO2_KG_PER_KM) * AVG_DIVERSION_KM

    for tid, hold in hold_adjustments.items():
        trace.append(f"{tid} held {hold} min at its current station to restore {DEPOT_PROXIMITY_SEGMENTS}-min+ headway.")
    if assigned_buses:
        trace.append(
            f"Diverted {STRANDED_LOAD_PASSENGERS} stranded riders onto {len(assigned_buses)} bus(es) "
            f"({ev_used} EV, {diesel_used} diesel) from depot(s) within {DEPOT_PROXIMITY_SEGMENTS} segments of {affected_segment_id}."
        )
    if ev_used:
        trace.append(f"Estimated CO2 avoided vs. an all-diesel diversion: {co2_avoided:.1f} kg (rough public per-km averages, not a precise audit).")

    return Plan(
        feasible=True,
        hold_adjustments=hold_adjustments,
        buses_assigned=assigned,
        ev_used=ev_used,
        diesel_used=diesel_used,
        co2_avoided_kg=round(co2_avoided, 1),
        constraint_trace=trace,
    )
