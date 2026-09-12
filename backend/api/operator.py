"""
REST contract matching the frontend handoff spec (Sections 30, 36-37).
Thin wrappers over World/ApprovalWorkflow -- no business logic lives here;
see backend/optimizer, backend/propagation, backend/approval for that.
"""
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
_world = None  # injected by app.py at import time to avoid a circular import


def init(world):
    global _world
    _world = world


def _find_candidate(plan_id: str):
    for cand in _world.approvals.candidates.values():
        if cand.plan.get("plan_id") == plan_id:
            return cand
    raise HTTPException(404, f"No plan {plan_id}")


# ---------------------------------------------------------------- trains / hazards
@router.get("/api/trains")
def list_trains():
    return _world.trains


@router.get("/api/trains/{train_id}")
def get_train(train_id: str):
    t = _world._train_by_id(train_id)
    if not t:
        raise HTTPException(404, "train not found")
    return t


@router.get("/api/hazards")
def list_hazards():
    return [
        {**seg, "flood_risk": round(_world.segment_flood_risk(seg["id"]), 3)}
        for seg in _world.segments_by_id.values()
    ]


@router.get("/api/hazards/{segment_id}")
def get_hazard(segment_id: str):
    if segment_id not in _world.segments_by_id:
        raise HTTPException(404, "segment not found")
    seg = _world.segments_by_id[segment_id]
    return {**seg, "flood_risk": round(_world.segment_flood_risk(segment_id), 3)}


# ---------------------------------------------------------------- operator decisions
@router.get("/api/operator/pending")
def pending():
    return [_world.approvals.as_dict(c) for c in _world.approvals.pending()]


@router.post("/api/optimization/run")
def optimization_run():
    """The optimizer already runs continuously inside the sim loop the moment a
    predicted delay crosses threshold -- this endpoint exists for contract
    compatibility and simply returns current pending candidates."""
    return {"ok": True, "pending": [_world.approvals.as_dict(c) for c in _world.approvals.pending()]}


class DecisionIn(BaseModel):
    approver: str = "operator"
    reason: str | None = None


@router.post("/api/operator/decision/{plan_id}/approve")
async def approve(plan_id: str, body: DecisionIn):
    cand = _find_candidate(plan_id)
    decided = _world.approvals.decide(cand.id, approve=True, approver=body.approver)
    if not decided:
        raise HTTPException(409, "plan already decided")
    await _world._apply_plan(decided)  # apply immediately, don't wait for the next tick
    return {"ok": True, "candidate": _world.approvals.as_dict(decided)}


@router.post("/api/operator/decision/{plan_id}/reject")
async def reject(plan_id: str, body: DecisionIn):
    cand = _find_candidate(plan_id)
    decided = _world.approvals.decide(cand.id, approve=False, approver=body.approver)
    if not decided:
        raise HTTPException(409, "plan already decided")
    if body.reason:
        decided.plan["reject_reason"] = body.reason
        if _world.approvals.audit_log:
            _world.approvals.audit_log[-1]["reason"] = body.reason
    await _world.reject_plan(decided)
    return {"ok": True, "candidate": _world.approvals.as_dict(decided)}


class ModifyIn(BaseModel):
    hold_overrides: dict[str, float] = {}


@router.post("/api/operator/decision/{plan_id}/modify")
def modify(plan_id: str, body: ModifyIn):
    cand = _find_candidate(plan_id)
    if cand.status != "pending":
        raise HTTPException(409, "plan already decided")
    validation = _world.validate_adjustment(cand, body.hold_overrides)
    if not validation["valid"]:
        return {"ok": False, "validation": validation}
    cand.plan["hold_adjustments"] = {**cand.plan["hold_adjustments"], **body.hold_overrides}
    cand.plan["adjusted"] = True
    return {"ok": True, "candidate": _world.approvals.as_dict(cand), "validation": validation}


class ValidateIn(BaseModel):
    plan_id: str
    hold_overrides: dict[str, float] = {}


@router.post("/api/operator/validate")
def validate(body: ValidateIn):
    cand = _find_candidate(body.plan_id)
    return _world.validate_adjustment(cand, body.hold_overrides)


# ---------------------------------------------------------------- simulation controls
class WhatIfIn(BaseModel):
    rainfall_mm: float | None = None
    rainfall_multiplier: float | None = None
    line_id: str = "central_main"


@router.post("/api/simulation/what-if")
def what_if(body: WhatIfIn):
    if body.rainfall_mm is not None:
        _world.set_rainfall(body.rainfall_mm, body.line_id)
    elif body.rainfall_multiplier is not None:
        current = _world.rainfall_by_line.get(body.line_id, 5.0)
        _world.set_rainfall(current * body.rainfall_multiplier, body.line_id)
    return {"ok": True, "rainfall_by_line": _world.rainfall_by_line}


class BlockageIn(BaseModel):
    segment_id: str
    kind: str = "track_block"   # track_block | road_block
    severity: float = 0.95
    note: str = ""
    duration_min: int = 45
    cause: str = "unspecified"  # unspecified | tree_fall | accident | flooding | landslide | signal_failure


@router.post("/api/hazards/block")
def block_segment(body: BlockageIn):
    """Close a specific track or parallel road. Feeds the same event pipeline
    as rainfall -- the ETA model, propagation graph and optimizer treat it
    identically, which is the whole point of the shared event schema."""
    event = _world.block_segment(body.segment_id, body.kind, body.severity, body.note, body.duration_min, body.cause)
    if event is None:
        raise HTTPException(404, "unknown segment")
    return {"ok": True, "event": event, "blocked": _world.blocked_segments}


@router.post("/api/hazards/clear/{segment_id}")
def clear_segment(segment_id: str):
    _world.clear_segment(segment_id)
    return {"ok": True, "blocked": _world.blocked_segments}


class SpeedIn(BaseModel):
    multiplier: int


@router.post("/api/simulation/speed")
def set_speed(body: SpeedIn):
    if body.multiplier not in (1, 2, 5):
        raise HTTPException(400, "multiplier must be 1, 2, or 5")
    _world.speed_multiplier = body.multiplier
    return {"ok": True, "speed_multiplier": _world.speed_multiplier}


@router.post("/api/operations/reset")
async def reset_operations():
    _world.reset_operations(reset_clock=True)
    snap = _world.snapshot()
    await _world.connections.broadcast_admin(snap)
    await _world.connections.broadcast_operations("SIMULATION_UPDATED", {
        "clock_min": snap["clock_min"], "paused": snap["paused"], "speed_multiplier": snap["speed_multiplier"],
        "timezone": snap["timezone"], "timezone_label": snap["timezone_label"],
        "trains": snap["trains"], "segments": snap["segments"], "manual_events": snap["manual_events"],
        "recommendations": [], "metrics": {},
    })
    return {"ok": True, "state": snap}


# ---------------------------------------------------------------- optional: maintenance / hardware events (36-37)
class MaintenanceIn(BaseModel):
    text: str


@router.post("/api/maintenance/upload")
def maintenance_upload(body: MaintenanceIn):
    """Simulates 'document intelligence': a real PDF parser would replace this
    regex with an LLM/NLP extraction step -- the event shape downstream is
    identical either way (see event_bus/incident_classifier.py for the same pattern)."""
    match = re.search(r"T\d{3}", body.text.upper())
    train_id = match.group(0) if match else None
    event = {
        "type": "maintenance", "train_id": train_id, "text": body.text,
        "timestamp": __import__("time").time(),
    }
    _world.manual_events.append(event)
    if train_id and _world._train_by_id(train_id):
        t = _world._train_by_id(train_id)
        t["status"] = "delayed"
        t["delay_min"] = round(t["delay_min"] + 20, 1)
    return {"ok": True, "event": event}


class DriverEventIn(BaseModel):
    vehicle_id: str
    event_type: str
    severity: str


@router.post("/api/events/driver")
def driver_event(body: DriverEventIn):
    event = {
        "type": "driver_alert", "vehicle_id": body.vehicle_id,
        "event_type": body.event_type, "severity": body.severity,
        "timestamp": __import__("time").time(),
    }
    _world.manual_events.append(event)
    return {"ok": True, "event": event}


# ---------------------------------------------------------------- audit
@router.get("/api/audit")
def audit():
    return _world.approvals.audit_log


@router.post("/api/audit/clear")
def clear_audit():
    _world.approvals.audit_log.clear()
    return {"ok": True}
