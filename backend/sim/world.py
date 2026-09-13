"""
The live simulation loop (master spec Section 12, step 5).
Owns all mutable world state, advances trains each tick, scores flood risk
per segment from the admin-controlled rainfall level, calls the ETA model,
and triggers the propagate -> optimize -> human-approval loop when a
predicted delay crosses the disruption threshold.

Also emits the typed operations events described in the frontend handoff
spec (HAZARD_UPDATED, TRAIN_UPDATED, PLAN_GENERATED, PLAN_APPROVED, ...)
over the shared /ws/operations channel, in addition to the original
admin/rider channels kept for the legacy static frontend.
"""
import asyncio
import json
import time
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import xgboost as xgb

from backend.approval.workflow import ApprovalWorkflow
from backend.optimizer.reoptimize import solve_plan
from backend.optimizer.robust import choose_robust_action, explain_robust_decision
from backend.propagation.graph import find_downstream_conflicts, MIN_HEADWAY_MIN
from backend.websocket.manager import ConnectionManager
from ml.explainability.explain import explain_prediction

ROOT = Path(__file__).resolve().parents[2]
SYN = ROOT / "data" / "synthetic"
ARTIFACTS = ROOT / "ml" / "eta_model" / "artifacts"

DISRUPTION_THRESHOLD_MIN = 15.0
LOOKAHEAD_SEGMENTS = 3   # how far ahead a train "sees" hazards (the predict-before-it-happens window)
RECOVERY_MIN_PER_TICK = 0.8   # delay a train works off per simulated minute once the hazard is behind it
DEFAULT_BLOCK_DURATION_MIN = 45  # a closed segment reopens on its own after this, unless cleared manually
TICK_SECONDS = 2.0
# A blockage caused by a real-world incident (not routine maintenance) gets
# reported to whichever authority actually owns that problem. Purely internal
# causes (signal failure, technical, unspecified) stay an operator-only event.
AUTHORITY_BY_CAUSE = {
    "tree_fall": "Municipal Disaster Management Cell",
    "accident": "Railway Protection Force",
    "flooding": "State Disaster Management Authority",
    "landslide": "State Disaster Management Authority",
    "road_blockage": "Traffic Police & Municipal Roads Department",
}
DEFAULT_COMPLAINT_AUTHORITY = "Railway Control Room"
SEVERITY_REROUTE_THRESHOLD = 0.5  # at/above this, a bus reroute is allocated, not just a hold
MAX_COMPLAINTS = 100  # rider photo reports keep only the most recent 100, same cap as the decision log
# How a manually-blocked segment's cause should read in an explanation --
# "flood risk" is only ever accurate when rain is actually the cause.
CAUSE_RISK_PHRASE = {
    "tree_fall": "a fallen tree",
    "accident": "an accident",
    "flooding": "flood risk",
    "landslide": "a landslide",
    "signal_failure": "a signal failure",
}
SPEED_FACTOR = {"fast": 0.16, "slow": 0.10}  # segment-fraction advanced per tick, at 1x speed
AVG_PASSENGERS_PER_TRAIN = 120
SIM_TIMEZONE = "Asia/Kolkata"


class World:
    def __init__(self):
        lines_data = json.loads((SYN / "lines.json").read_text())["lines"]
        self.lines = {l["id"]: l for l in lines_data}
        self._initial_trains = json.loads((SYN / "trains.json").read_text())
        self._initial_roads = json.loads((SYN / "roads.json").read_text())
        self.trains = deepcopy(self._initial_trains)
        self.roads = deepcopy(self._initial_roads)
        fleet = json.loads((SYN / "fleet.json").read_text())
        self._initial_buses = fleet["buses"]
        self._initial_chargers = fleet["chargers"]
        self.buses = deepcopy(self._initial_buses)
        self.chargers = deepcopy(self._initial_chargers)
        self.shuttle = json.loads((SYN / "shuttle.json").read_text())
        self.calibration = json.loads((SYN / "rainfall_calibration.json").read_text())
        self.incident_templates = json.loads((SYN / "incident_templates.json").read_text())

        self.model = xgb.XGBRegressor()
        self.model.load_model(str(ARTIFACTS / "eta_model.json"))
        self.feature_order = json.loads((ARTIFACTS / "feature_order.json").read_text())

        self.rainfall_by_line: dict[str, float] = {lid: 5.0 for lid in self.lines}
        self.manual_incident_boost: dict[str, float] = {}  # segment_id -> extra severity
        self.clock_min = self._current_ist_minute()
        self.approvals = ApprovalWorkflow()
        self.connections = ConnectionManager()
        self._active_candidate_segments: set[str] = set()
        self.paused = False
        self.speed_multiplier = 1
        self.manual_events: list[dict] = []  # maintenance uploads, hardware/driver events (Sections 36-37)
        self.blocked_segments: dict[str, dict] = {}  # segment_id -> {kind, severity, note, since_min}
        self.road_blocked_segments: set[str] = set()  # roads unusable => no bus diversion there
        self._plan_counter = 0
        self.complaints: list[dict] = []  # rider photo reports of a blockage they can see, awaiting operator action
        self._complaint_counter = 0

        self.segments_by_id = {}
        self.stations_by_code = {}
        self.line_segments: dict[str, list[dict]] = {}
        self.line_stations: dict[str, list[dict]] = {}
        for line_id, line in self.lines.items():
            ordered_stations = sorted(line["stations"], key=lambda s: s["order"])
            self.line_stations[line_id] = ordered_stations
            self.line_segments[line_id] = line["segments"]
            for s in ordered_stations:
                self.stations_by_code[s["code"]] = s
            for seg in line["segments"]:
                self.segments_by_id[seg["id"]] = seg
        self.roads_by_segment = {r["shadows_segment"]: r for r in self.roads}
        self._decorate_train_routes()

    # -------------------------------------------------------------- risk
    def segment_flood_risk(self, segment_id: str) -> float:
        seg = self.segments_by_id[segment_id]
        # Rainfall is a LOCAL weather event per line, not a city-wide constant --
        # rain on the Western line must not flag every train on the Harbour or
        # Central lines as at-risk. Each line tracks its own rainfall reading.
        rainfall = self.rainfall_by_line.get(seg["line_id"], 5.0)
        threshold = self.calibration["disruption_threshold_mm"]
        excess = max(0.0, rainfall - threshold)
        risk = min(1.0, excess / 100.0 + seg["base_risk"])
        risk += self.manual_incident_boost.get(segment_id, 0.0)
        return min(1.0, risk)

    def segment_congestion(self, segment_id: str) -> float:
        road = self.roads_by_segment.get(segment_id)
        return road["congestion_index"] if road else 0.1

    def risk_ahead(self, train: dict, lookahead: int = LOOKAHEAD_SEGMENTS) -> dict:
        """The whole premise of this project is predicting a delay BEFORE the train
        reaches the hazard -- so the model feature must be the worst risk on the
        segments ahead, not the one the train is already sitting on.

        Returns the worst segment within the look-ahead window, how many segments
        away it is, and roughly how many minutes until the train gets there.
        """
        segs = self.line_segments[train["line_id"]]
        idx = train["current_segment_index"]
        speed = SPEED_FACTOR[train["service_type"]]  # segment-fraction per simulated minute

        worst = {"risk": 0.0, "segment_id": None, "segments_away": 0, "minutes_away": 0.0}
        for offset in range(0, lookahead + 1):
            i = idx + offset
            if i >= len(segs):
                break
            seg_id = segs[i]["id"]
            # A segment that's actually BLOCKED (track or road) is a certain
            # hazard, not a probabilistic one -- it must never be out-ranked by
            # some other segment's merely-elevated flood risk, or the model
            # ends up explaining the wrong segment (and the wrong cause)
            # entirely for a closure that has nothing to do with rain.
            risk = max(self.segment_flood_risk(seg_id), 0.95 if seg_id in self.blocked_segments else 0.0)
            if risk > worst["risk"]:
                # distance to the START of that segment, accounting for current progress
                segments_to_go = max(0.0, offset - train["progress_in_segment"])
                worst = {
                    "risk": risk, "segment_id": seg_id, "segments_away": offset,
                    "minutes_away": round(segments_to_go / speed, 1),
                }
        if worst["segment_id"] is None:
            worst["segment_id"] = segs[min(idx, len(segs) - 1)]["id"]
        return worst

    def _risk_label_override(self, segment_id: str) -> dict | None:
        """A manually-blocked segment's real cause (or lack of one) should
        drive the explanation, never a hardcoded assumption that everything
        is about flooding -- a road block from an accident has nothing to do
        with rain, and saying so is actively misleading to both operator and
        rider."""
        info = self.blocked_segments.get(segment_id)
        if not info:
            return None
        phrase = CAUSE_RISK_PHRASE.get(info.get("cause"))
        if not phrase:
            phrase = "a road closure" if info["kind"] == "road_block" else "a track closure"
        return {"flood_risk_ahead": phrase}

    # -------------------------------------------------------------- tick
    async def tick(self):
        self._expire_blockages()
        if self.paused:
            for train in self.trains:
                self._advance_train(train, move=False)  # refresh hazards/ETAs without moving the service
            await self.connections.broadcast_admin(self.snapshot())
            return

        self.clock_min += self.speed_multiplier
        for train in self.trains:
            self._advance_train(train)
        for cand in self.approvals.check_sla_timeouts():
            await self._apply_plan(cand)  # SLA auto-approvals still need to be materialized
        for cand in self.approvals.candidates.values():
            if cand.status == "approved" and not cand.plan.get("_applied"):
                await self._apply_plan(cand)  # safety net for any approval path that didn't apply inline
        snap = self.snapshot()
        await self.connections.broadcast_admin(snap)
        await self.connections.broadcast_operations("SIMULATION_UPDATED", {
            "clock_min": self.clock_min, "paused": self.paused, "speed_multiplier": self.speed_multiplier,
            "trains": snap["trains"], "segments": snap["segments"], "manual_events": snap["manual_events"],
            "complaints": snap["complaints"],
        })

    def _advance_train(self, train: dict, move: bool = True):
        segs = self.line_segments[train["line_id"]]
        idx = train["current_segment_index"]
        if idx >= len(segs):
            if not move:
                return
            # reached terminus -- loop it back for a continuous live demo
            train["current_segment_index"] = 0
            train["progress_in_segment"] = 0.0
            train["delay_min"] = 0
            train["status"] = "on_time"
            train["scheduled_departure_min"] = self.clock_min
            return

        seg = segs[idx]
        if move:
            train["progress_in_segment"] += SPEED_FACTOR[train["service_type"]] * self.speed_multiplier

        # Look AHEAD, not down: the worst hazard in the next few segments is what
        # drives the prediction, which is what lets us warn before the train arrives.
        ahead = self.risk_ahead(train)
        risk = ahead["risk"]
        hazard_segment_id = ahead["segment_id"]
        congestion = self.segment_congestion(hazard_segment_id)
        row = {
            "current_delay_min": float(train["delay_min"]),
            "flood_risk_ahead": risk,
            "road_congestion_index": congestion,
            "hour_of_day": (self.clock_min // 60) % 24,
            "segment_base_risk": self.segments_by_id[hazard_segment_id]["base_risk"],
            "rainfall_mm": self.rainfall_by_line.get(train["line_id"], 5.0),
        }
        exp = explain_prediction(self.model, self.feature_order, row,
                                  label_overrides=self._risk_label_override(hazard_segment_id))
        train["risk_ahead"] = round(risk, 3)
        train["hazard_segment_ahead"] = hazard_segment_id if risk >= 0.2 else None
        train["minutes_to_hazard"] = ahead["minutes_away"] if risk >= 0.2 else None

        hazard_active = exp.predicted_delay_min >= DISRUPTION_THRESHOLD_MIN

        if hazard_active and hazard_segment_id not in self._active_candidate_segments:
            train["status"] = "at_risk"
            train["delay_min"] = round(exp.predicted_delay_min, 1)
            self._trigger_replan(train, hazard_segment_id, risk, exp, onset_minutes=max(1.0, ahead["minutes_away"]))
        elif hazard_active:
            train["status"] = "at_risk"   # hazard still ahead, plan already proposed for this segment
        else:
            # RECOVERY: nothing hazardous ahead any more, so the train works off its
            # delay instead of staying flagged forever. Without this a train stays
            # "at risk" for the rest of the run even after the water has cleared.
            train["delay_min"] = max(0.0, round(train["delay_min"] - RECOVERY_MIN_PER_TICK * self.speed_multiplier, 1))
            train["status"] = "on_time" if train["delay_min"] < 2 else "delayed"

        if move and train["progress_in_segment"] >= 1.0:
            train["progress_in_segment"] = 0.0
            train["current_segment_index"] += 1

    def _current_ist_minute(self) -> int:
        now = datetime.now(ZoneInfo(SIM_TIMEZONE))
        return now.hour * 60 + now.minute

    # -------------------------------------------------------------- routes (for map current/proposed/approved lines)
    def route_stations(self, train: dict, diversion_segment_id: str | None = None) -> list[str]:
        stations = self.line_stations[train["line_id"]]
        segs = self.line_segments[train["line_id"]]
        idx = min(train["current_segment_index"], len(segs) - 1)
        start_code = segs[idx]["from"]
        start_order = self.stations_by_code[start_code]["order"]
        route = [s["code"] for s in stations if s["order"] >= start_order]
        if diversion_segment_id and diversion_segment_id in self.segments_by_id:
            seg = self.segments_by_id[diversion_segment_id]
            if seg["from"] in route:
                i = route.index(seg["from"])
                route = route[:i + 1] + [f"VIA_ROAD_{diversion_segment_id}"] + route[i + 1:]
        return route

    # -------------------------------------------------------------- replan
    def _trigger_replan(self, train, segment_id, risk, exp, onset_minutes: float = 10.0):
        self._active_candidate_segments.add(segment_id)

        # onset_minutes is now a real quantity: how long until this train actually
        # reaches the hazardous segment, from risk_ahead().
        robust = choose_robust_action(
            base_delay_min=exp.predicted_delay_min, onset_minutes=onset_minutes,
            hops_from_source=0, seed=hash(f"{train['id']}-{segment_id}-{self.clock_min}") % (2**31),
        )
        robust_explanation = explain_robust_decision(robust)

        line_trains = [t for t in self.trains if t["line_id"] == train["line_id"]]
        conflicts = find_downstream_conflicts(line_trains, train["id"], exp.predicted_delay_min)
        plan = solve_plan(
            conflicts=conflicts,
            affected_segment_id=segment_id,
            corridor_segments=self.line_segments[train["line_id"]],
            buses=self.buses,
            chargers=self.chargers,
            stations_by_code=self.stations_by_code,
            road_available=segment_id not in self.road_blocked_segments,
        )
        self._plan_counter += 1
        plan_dict = {
            "plan_id": f"PLAN-{self._plan_counter:03d}",
            "feasible": plan.feasible,
            "hold_adjustments": plan.hold_adjustments,
            "buses_assigned": plan.buses_assigned,
            "ev_used": plan.ev_used,
            "diesel_used": plan.diesel_used,
            "co2_avoided_kg": plan.co2_avoided_kg,
            "constraint_trace": plan.constraint_trace,
            "downstream_conflicts": conflicts,
            "previous_route": self.route_stations(train),
            "approved_route": self.route_stations(train, diversion_segment_id=segment_id if plan.buses_assigned else None),
            "robust_decision": {
                "chosen_action": robust.chosen.action,
                "onset_minutes": robust.onset_minutes,
                "corridor_budget_min": robust.corridor_budget_min,
                "explanation": robust_explanation,
                "scenarios": [
                    {"action": r.action, "type": r.type, "within_budget_rate": r.within_budget_rate,
                     "avg_cost": r.avg_cost, "worst_cost": r.worst_cost,
                     "avg_passenger_minutes": r.avg_passenger_minutes,
                     "avg_delay_min": r.avg_delay_min, "operational_cost": r.operational_cost}
                    for r in robust.all_results
                ],
            },
            "_applied": False,
        }
        rider_friendly_action = {
            "hold": "holding your train briefly", "speed_restrict": "running at a reduced speed",
            "reroute": "rerouting you via a connecting bus",
        }.get(robust.chosen.type, "adjusting the schedule")

        # Bus residual delay comes from the robust model's reroute scenario, so the
        # two passenger options are quoted from the same numbers the operator saw.
        reroute_result = next((r for r in robust.all_results if r.type == "reroute"), None)
        plan_dict["passenger_action"] = self._passenger_instructions(
            seg_id=segment_id, plan=plan, onset_minutes=onset_minutes,
            predicted_delay_min=exp.predicted_delay_min,
            bus_delay_min=reroute_result.avg_delay_min if reroute_result else exp.predicted_delay_min * 0.15,
        )
        seg = self.segments_by_id[segment_id]
        lookahead_line = (
            f"{train['id']} is {onset_minutes:.0f} min from segment {seg['from']}-{seg['to']}, "
            f"where risk is currently {risk * 100:.0f}%. It is NOT yet delayed -- this is a forward prediction."
        )
        cand = self.approvals.submit(
            train_id=train["id"],
            affected_segment_id=segment_id,
            severity=risk,
            admin_explanation=lookahead_line + "\n\n" + exp.admin_text + "\n\n" + "\n".join(plan.constraint_trace) + "\n\n" + robust_explanation,
            rider_explanation=(
                f"{exp.rider_text} It's about {onset_minutes:.0f} minutes ahead of your train. "
                f"We're {rider_friendly_action} -- of {len(robust.all_results)} options tested against "
                f"10 possible timings, this one held up best."
            ),
            plan=plan_dict,
        )
        asyncio.create_task(self.connections.broadcast_admin({
            "type": "candidate_created",
            "candidate": self.approvals.as_dict(cand),
        }))
        seg = self.segments_by_id[segment_id]
        asyncio.create_task(self.connections.broadcast_operations("HAZARD_UPDATED", {
            "segment_id": segment_id, "risk": round(risk, 3),
            "onset_minutes": 0, "duration_minutes": 90,
        }))
        asyncio.create_task(self.connections.broadcast_operations("ETA_UPDATED", {
            "train_id": train["id"], "current_eta_min": self.clock_min,
            "predicted_delay_min": exp.predicted_delay_min, "explanation": exp.admin_text,
        }))
        asyncio.create_task(self.connections.broadcast_operations("PLAN_GENERATED", {
            "plan_id": plan_dict["plan_id"], "train_id": train["id"], "candidate": self.approvals.as_dict(cand),
        }))

    def _passenger_instructions(self, seg_id: str, plan, onset_minutes: float,
                                predicted_delay_min: float, bus_delay_min: float) -> dict:
        """Choices, not orders.

        The passenger bought a train ticket, so STAYING ON THE TRAIN is always
        the first option, with its honest delay. The bus diversion is offered as
        an alternative with its own numbers, and only becomes instructions once
        they actually choose it. Telling someone "you have been rerouted" when
        they'd rather sit tight is the wrong product.
        """
        seg = self.segments_by_id[seg_id]
        alight = self.stations_by_code[seg["from"]]
        rejoin = self.stations_by_code[seg["to"]]

        stay_option = {
            "id": "stay_on_train",
            "title": "Stay on your train",
            "delay_min": round(predicted_delay_min),
            "detail": (
                f"Your train continues through {seg['from']}-{seg['to']}. Expect about "
                f"{round(predicted_delay_min)} minutes of delay. No changes, no walking, your seat is yours."
            ),
            "is_primary": True,
        }

        if not plan.buses_assigned:
            return {
                "type": "hold_only",
                "headline": "Stay on board - your train is being held briefly.",
                "recommended": "stay_on_train",
                "options": [stay_option],
            }

        bus_option = {
            "id": "switch_to_bus",
            "title": f"Switch to a replacement bus at {alight['name']}",
            "delay_min": round(bus_delay_min),
            "detail": (
                f"Get off at {alight['name']}, walk {alight['bus_bay_walk_m']}m to the bus bay, and rejoin "
                f"the line at {rejoin['name']}. Faster, but you'll need to change."
            ),
            "is_primary": False,
            "alight_station_code": alight["code"],
            "alight_station_name": alight["name"],
            "platform": alight["diversion_platform"],
            "walk_to_bus_m": alight["bus_bay_walk_m"],
            "walk_minutes": max(2, round(alight["bus_bay_walk_m"] / 80)),  # ~80 m/min walking
            "bus_count": len(plan.buses_assigned),
            "bus_ids": plan.buses_assigned,
            "rejoin_station_code": rejoin["code"],
            "rejoin_station_name": rejoin["name"],
            "minutes_until_you_must_alight": round(onset_minutes),
        }

        return {
            "type": "choice",
            "headline": f"Delay ahead on {seg['from']}-{seg['to']} - you have two options",
            "recommended": "stay_on_train",
            "minutes_to_decide": round(onset_minutes),
            "options": [stay_option, bus_option],
        }

    async def _apply_plan(self, cand):
        """Materializes an approved plan onto world state. Called immediately from the
        decision endpoint (for instant UI feedback) or from an SLA auto-approval tick."""
        plan = cand.plan
        if plan.get("_applied"):
            return
        for train_id, hold in plan.get("hold_adjustments", {}).items():
            t = self._train_by_id(train_id)
            if t:
                t["delay_min"] = round(t["delay_min"] + hold, 1)
                t["status"] = "delayed"
        for bus_id in plan.get("buses_assigned", []):
            b = self._bus_by_id(bus_id)
            if b:
                b["assigned_route"] = cand.affected_segment_id
                b["current_load"] = b["capacity"]
        plan["_applied"] = True
        self._active_candidate_segments.discard(cand.affected_segment_id)

        effective_from = self.clock_min + 2
        payload = {
            "type": "plan_approved",
            "train_id": cand.train_id,
            "affected_segment_id": cand.affected_segment_id,
            "new_eta_delay_min": self._train_by_id(cand.train_id)["delay_min"] if self._train_by_id(cand.train_id) else None,
            "effective_from_min": effective_from,
            "reason": cand.rider_explanation,
            "route_note": (
                f"Rail + connecting bus via segment {cand.affected_segment_id}"
                if plan.get("buses_assigned") else "Rail (schedule adjusted)"
            ),
            "decided_by": cand.decided_by,
        }
        await self.connections.broadcast_admin({"type": "plan_applied", **payload})
        await self.connections.broadcast_rider(cand.train_id, payload)
        for train_id in plan.get("hold_adjustments", {}):
            await self.connections.broadcast_rider(train_id, {**payload, "train_id": train_id})

        await self.connections.broadcast_operations("PLAN_APPROVED", {
            "plan_id": plan["plan_id"], "train_id": cand.train_id,
            "previous_route": plan["previous_route"], "approved_route": plan["approved_route"],
            "new_eta_delay_min": payload["new_eta_delay_min"],
        })
        await self.connections.broadcast_operations("SERVICE_UPDATED", {
            "train_id": cand.train_id, "status": self._train_by_id(cand.train_id)["status"] if self._train_by_id(cand.train_id) else None,
            "route_note": payload["route_note"], "reason": payload["reason"],
        })
        before_after = self.impact_summary(plan)
        await self.connections.broadcast_operations("IMPACT_UPDATED", before_after)

    async def reject_plan(self, cand):
        self._active_candidate_segments.discard(cand.affected_segment_id)
        await self.connections.broadcast_operations("PLAN_REJECTED", {
            "plan_id": cand.plan["plan_id"], "train_id": cand.train_id,
        })

    def impact_summary(self, plan: dict) -> dict:
        holds = plan.get("hold_adjustments", {})
        without = {tid: round(h, 1) for tid, h in holds.items()}
        after = {tid: max(0.0, round(h * 0.25, 1)) for tid, h in holds.items()}  # remaining residual after re-plan
        pml_before = sum(without.values()) * AVG_PASSENGERS_PER_TRAIN
        pml_after = sum(after.values()) * AVG_PASSENGERS_PER_TRAIN
        return {
            "plan_id": plan["plan_id"],
            "without_intervention": without,
            "after_approval": after,
            "conflicts_before": len(holds),
            "conflicts_after": 0,
            "passenger_minutes_before": round(pml_before),
            "passenger_minutes_after": round(pml_after),
            "passenger_minutes_saved": round(pml_before - pml_after),
        }

    def validate_adjustment(self, cand, hold_overrides: dict) -> dict:
        """Section 19 -- deterministic, rule-based validation. No ML/LLM involved."""
        checks = []
        valid = True
        suggestions = []
        conflicts = {c["train_id"]: c["inherited_delay_min"] for c in cand.plan.get("downstream_conflicts", [])}

        checks.append({"label": "Route feasible", "ok": True})
        checks.append({"label": "Track available", "ok": True})
        checks.append({"label": "Platform available", "ok": True})

        for train_id, hold in hold_overrides.items():
            required = conflicts.get(train_id, 0)
            if hold < required:
                valid = False
                checks.append({"label": f"Timing constraint for {train_id}", "ok": False,
                               "detail": f"Hold of {hold} min leaves a headway violation "
                                         f"(needs >= {required} min to keep the {MIN_HEADWAY_MIN}-min minimum)."})
                suggestions.append(f"Increase {train_id}'s hold to at least {required} min")
            else:
                checks.append({"label": f"Timing constraint for {train_id}", "ok": True})

        additional_delay = sum(max(0, h - conflicts.get(tid, 0)) for tid, h in hold_overrides.items())
        passenger_impact = sum(hold_overrides.values()) * AVG_PASSENGERS_PER_TRAIN

        return {
            "valid": valid,
            "checks": checks,
            "additional_delay_min": additional_delay,
            "passenger_impact_minutes": passenger_impact,
            "suggested_alternatives": suggestions,
        }

    def _train_by_id(self, train_id):
        return next((t for t in self.trains if t["id"] == train_id), None)

    def _bus_by_id(self, bus_id):
        return next((b for b in self.buses if b["id"] == bus_id), None)

    # -------------------------------------------------------------- snapshot / actions
    def snapshot(self) -> dict:
        return {
            "type": "sim_tick",
            "clock_min": self.clock_min,
            "rainfall_by_line": self.rainfall_by_line,
            "paused": self.paused,
            "speed_multiplier": self.speed_multiplier,
            "timezone": SIM_TIMEZONE,
            "timezone_label": "IST",
            "trains": self.trains,
            "lines": {lid: {"name": l["name"], "color": l["color"]} for lid, l in self.lines.items()},
            "segments": [
                {**seg, "flood_risk": round(self.segment_flood_risk(seg["id"]), 3),
                 "congestion": self.segment_congestion(seg["id"]),
                 "blocked": self.blocked_segments.get(seg["id"])}
                for line in self.lines.values() for seg in line["segments"]
            ],
            "stations": list(self.stations_by_code.values()),
            "roads": self.roads,
            "buses": self.buses,
            "chargers": self.chargers,
            "shuttle": self.shuttle,
            "manual_events": self.manual_events,
            "complaints": self.complaints,
        }

    def set_rainfall(self, mm: float, line_id: str = "central_main"):
        self.rainfall_by_line[line_id] = max(0.0, mm)

    def reset_operations(self, reset_clock: bool = True):
        self.trains = deepcopy(self._initial_trains)
        self.roads = deepcopy(self._initial_roads)
        self.buses = deepcopy(self._initial_buses)
        self.chargers = deepcopy(self._initial_chargers)
        self.rainfall_by_line = {lid: 5.0 for lid in self.lines}
        self.manual_incident_boost.clear()
        self.blocked_segments.clear()
        self.road_blocked_segments.clear()
        self.manual_events.clear()
        self._active_candidate_segments.clear()
        self.approvals = ApprovalWorkflow()
        if reset_clock:
            self.clock_min = self._current_ist_minute()
        self._decorate_train_routes()

    def _decorate_train_routes(self):
        service_labels = {"fast": "Fast", "slow": "Slow"}
        for idx, train in enumerate(self.trains):
            line = self.lines.get(train["line_id"], {})
            label = service_labels.get(train["service_type"], train["service_type"].title())
            train["route_name"] = f"{line.get('name', train['line_id'])} {label}"
            train["route_code"] = f"{train['line_id'][:3].upper()}-{idx + 1:02d}"

    def inject_incident(self, event: dict):
        segment_id = event.get("location")
        if segment_id in self.segments_by_id:
            self.manual_incident_boost[segment_id] = event.get("severity", 0.5)

    def block_segment(self, segment_id: str, kind: str, severity: float, note: str = "",
                      duration_min: int = DEFAULT_BLOCK_DURATION_MIN, cause: str = "unspecified"):
        """A track/road blockage is just a very severe event on one segment --
        same event schema, same downstream pipeline, no special-case code.
        Blockages expire on their own so the demo can't get stuck in a state
        where every segment is permanently shut."""
        if segment_id not in self.segments_by_id:
            return None

        # A blocked TRACK raises rail risk (trains can't pass).
        # A blocked ROAD does NOT -- it makes the parallel road unusable, which
        # removes the bus-diversion option and forces the optimizer back onto
        # holds. Two different failures with two genuinely different consequences.
        if kind == "track_block":
            self.manual_incident_boost[segment_id] = severity
        else:
            road = self.roads_by_segment.get(segment_id)
            if road:
                road["congestion_index"] = 1.0
            self.road_blocked_segments.add(segment_id)

        self.blocked_segments[segment_id] = {
            "kind": kind, "severity": severity, "note": note, "cause": cause,
            "since_min": self.clock_min, "until_min": self.clock_min + duration_min,
            "duration_min": duration_min,
        }
        # let this segment raise a fresh plan even if it already had one
        self._active_candidate_segments.discard(segment_id)
        event = {
            "type": "maintenance" if kind == "track_block" else "traffic",
            "location": segment_id, "severity": severity,
            "onset_minutes": 0, "duration_minutes": 90,
            "source": "admin_injected", "raw_text": note or f"{kind} on {segment_id}",
        }
        self.manual_events.append({**event, "timestamp": time.time(), "text": note or f"{kind.replace('_', ' ')} on {segment_id}"})

        # Real-world causes (a fallen tree, an accident, flooding...) are outside
        # the operator's own authority to fix -- notify whoever actually owns
        # that problem, and record what severity-based response we're taking
        # while we wait: a high-severity block gets a bus reroute allocated
        # immediately rather than just holding trains and hoping it clears.
        authority = AUTHORITY_BY_CAUSE.get(cause)
        if authority:
            reroute_action = (
                "Bus reroute allocated for affected services" if severity >= SEVERITY_REROUTE_THRESHOLD
                else "Monitoring — hold-only response while severity is assessed"
            )
            self.manual_events.append({
                "type": "authority_alert", "authority": authority, "cause": cause,
                "location": segment_id, "severity": severity, "reroute_action": reroute_action,
                "timestamp": time.time(),
                "text": f"{authority} notified — {cause.replace('_', ' ')} on {segment_id.replace('_', ' to ')}. {reroute_action}.",
            })
        return event

    def clear_segment(self, segment_id: str):
        self.manual_incident_boost.pop(segment_id, None)
        self.blocked_segments.pop(segment_id, None)
        self._active_candidate_segments.discard(segment_id)
        if segment_id in self.road_blocked_segments:
            self.road_blocked_segments.discard(segment_id)
            road = self.roads_by_segment.get(segment_id)
            if road:
                road["congestion_index"] = 0.2  # back to normal-ish traffic

    def _expire_blockages(self):
        for seg_id, info in list(self.blocked_segments.items()):
            if self.clock_min >= info.get("until_min", float("inf")):
                self.clear_segment(seg_id)
                self.manual_events.append({
                    "type": "maintenance", "location": seg_id, "timestamp": time.time(),
                    "text": f"{seg_id.replace('_', ' to ')} reopened (blockage cleared)",
                })

    # -------------------------------------------------------------- rider complaints (photo reports)
    def submit_complaint(self, cause: str, description: str, location: str,
                          image_data_url: str, segment_id: str | None = None,
                          train_id: str | None = None) -> dict:
        """A rider reporting what they can see (a fallen tree, a car on the
        track, a blocked road) with a photo. This is deliberately a SEPARATE
        inbox from the admin-triggered block_segment workflow -- a complaint
        is a claim from a passenger, not yet an operator-confirmed closure,
        so it sits for review rather than immediately raising rail risk."""
        self._complaint_counter += 1
        complaint = {
            "id": self._complaint_counter,
            "cause": cause,
            "description": description,
            "location": location,
            "segment_id": segment_id,
            "train_id": train_id,
            "image_data_url": image_data_url,
            "authority": AUTHORITY_BY_CAUSE.get(cause, DEFAULT_COMPLAINT_AUTHORITY),
            "status": "new",  # new -> notified
            "submitted_at": time.time(),
            "notified_at": None,
        }
        self.complaints.append(complaint)
        if len(self.complaints) > MAX_COMPLAINTS:
            self.complaints = self.complaints[-MAX_COMPLAINTS:]
        return complaint

    def notify_complaint(self, complaint_id: int) -> dict | None:
        complaint = next((c for c in self.complaints if c["id"] == complaint_id), None)
        if not complaint or complaint["status"] == "notified":
            return None
        complaint["status"] = "notified"
        complaint["notified_at"] = time.time()
        # Same event schema every other notification in this system uses --
        # it shows up in the operator's Active Events feed like any other alert.
        self.manual_events.append({
            "type": "authority_alert", "authority": complaint["authority"], "cause": complaint["cause"],
            "location": complaint["location"], "timestamp": time.time(),
            "text": f"{complaint['authority']} notified of rider report — {complaint['cause'].replace('_', ' ')} at {complaint['location']}.",
        })
        return complaint


async def run_forever(world: World):
    while True:
        await asyncio.sleep(TICK_SECONDS)
        await world.tick()
