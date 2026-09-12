"""
FastAPI app: REST endpoints for the admin/rider UIs, two WebSocket channels
(master spec Section 8), and the background sim loop (Section 12 step 5).

Run from the project root:
    uvicorn backend.api.app:app --reload
"""
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.api import operator as operator_routes
from backend.event_bus.incident_classifier import classify
from backend.sim.world import World, run_forever

ROOT = Path(__file__).resolve().parents[2]
world = World()
operator_routes.init(world)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(run_forever(world))
    yield
    task.cancel()


app = FastAPI(title="TransitResilience", lifespan=lifespan)

# The React dev server (Vite, :5173) runs on a different origin than this API (:8000).
# Wide open for the hackathon build -- tighten to explicit origins before any real deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(operator_routes.router)


# ---------------------------------------------------------------- REST
@app.get("/api/state")
def get_state():
    return world.snapshot()


class AnomalyIn(BaseModel):
    rainfall_mm: float


@app.post("/api/anomaly")
def post_anomaly(body: AnomalyIn):
    world.set_rainfall(body.rainfall_mm)
    return {"ok": True, "rainfall_mm": world.rainfall_mm}


class IncidentIn(BaseModel):
    text: str
    segment_id: str


@app.post("/api/incident")
def post_incident(body: IncidentIn):
    event = classify(body.text, body.segment_id, source="admin_injected")
    world.inject_incident(event)
    return {"ok": True, "event": event}


@app.post("/api/sim/toggle")
def post_sim_toggle():
    world.paused = not world.paused
    return {"ok": True, "paused": world.paused}


@app.get("/api/candidates")
def get_candidates():
    return [world.approvals.as_dict(c) for c in world.approvals.candidates.values()]


class DecisionIn(BaseModel):
    approve: bool
    approver: str = "admin"


@app.post("/api/candidates/{candidate_id}/decision")
async def post_decision(candidate_id: int, body: DecisionIn):
    cand = world.approvals.decide(candidate_id, approve=body.approve, approver=body.approver)
    if not cand:
        return {"ok": False, "error": "not found or already decided"}
    if body.approve:
        await world._apply_plan(cand)
    else:
        await world.reject_plan(cand)
    return {"ok": True, "candidate": world.approvals.as_dict(cand)}


class TripPlanIn(BaseModel):
    origin: str
    destination: str


@app.post("/api/trip/plan")
def post_trip_plan(body: TripPlanIn):
    stations = world.corridor["stations"]
    codes = {s["code"]: s for s in stations}
    if body.origin not in codes or body.destination not in codes:
        return {"ok": False, "error": "unknown station code"}
    origin_order = codes[body.origin]["order"]
    dest_order = codes[body.destination]["order"]
    if dest_order <= origin_order:
        return {"ok": False, "error": "destination must be further along the corridor than origin"}

    candidates = [t for t in world.trains if t["current_segment_index"] <= origin_order]
    if not candidates:
        candidates = world.trains
    best = min(candidates, key=lambda t: t["current_segment_index"])
    segments_to_cover = dest_order - origin_order
    speed = 0.16 if best["service_type"] == "fast" else 0.10
    travel_min = segments_to_cover / speed
    predicted_arrival = round(world.clock_min + travel_min + best["delay_min"])

    return {
        "ok": True,
        "train_id": best["id"],
        "service_type": best["service_type"],
        "origin": body.origin,
        "destination": body.destination,
        "predicted_arrival_min_of_day": predicted_arrival,
        "current_delay_min": best["delay_min"],
        "status": best["status"],
    }


# ---------------------------------------------------------------- WebSockets
@app.websocket("/ws/admin")
async def ws_admin(ws: WebSocket):
    await world.connections.connect_admin(ws)
    try:
        await ws.send_json(world.snapshot())
        while True:
            await ws.receive_text()  # admin socket is push-only; ignore inbound
    except WebSocketDisconnect:
        world.connections.disconnect_admin(ws)


@app.websocket("/ws/operations")
async def ws_operations(ws: WebSocket):
    """The single shared channel the frontend handoff spec (Section 28) expects.
    Both the admin console and the passenger app connect here and each renders
    only the fields relevant to it -- filtering happens client-side by design
    for this build (see technical.md for the tradeoff vs. the server-side
    per-rider filtering used by /ws/rider/{train_id})."""
    await world.connections.connect_operations(ws)
    try:
        await ws.send_json({"event": "SIMULATION_UPDATED", "timestamp": None, "payload": world.snapshot()})
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        world.connections.disconnect_operations(ws)


@app.websocket("/ws/rider/{train_id}")
async def ws_rider(ws: WebSocket, train_id: str):
    await world.connections.connect_rider(train_id, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        world.connections.disconnect_rider(train_id, ws)


# ---------------------------------------------------------------- static frontends
app.mount("/admin/assets", StaticFiles(directory=str(ROOT / "frontend-admin")), name="admin-assets")
app.mount("/rider/assets", StaticFiles(directory=str(ROOT / "frontend-user")), name="rider-assets")


@app.get("/admin")
def admin_page():
    return FileResponse(str(ROOT / "frontend-admin" / "index.html"))


@app.get("/")
def rider_page():
    return FileResponse(str(ROOT / "frontend-user" / "index.html"))
