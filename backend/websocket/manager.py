"""
Two channels, one event (master spec Section 8):
  - admin_channel: full detail, every connected ops console.
  - rider_channel:{train_id}: only riders following that specific train,
    receiving the filtered payload (route + eta + effective_from + one-line reason).
In-process broadcaster -- fine at hackathon/demo scale; swap for Redis pub/sub
to fan out across multiple backend processes.
"""
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.admin_connections: set[WebSocket] = set()
        self.rider_connections: dict[str, set[WebSocket]] = {}
        self.operations_connections: set[WebSocket] = set()

    async def connect_admin(self, ws: WebSocket):
        await ws.accept()
        self.admin_connections.add(ws)

    def disconnect_admin(self, ws: WebSocket):
        self.admin_connections.discard(ws)

    async def connect_rider(self, train_id: str, ws: WebSocket):
        await ws.accept()
        self.rider_connections.setdefault(train_id, set()).add(ws)

    def disconnect_rider(self, train_id: str, ws: WebSocket):
        if train_id in self.rider_connections:
            self.rider_connections[train_id].discard(ws)

    async def broadcast_admin(self, message: dict):
        dead = []
        for ws in self.admin_connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect_admin(ws)

    async def broadcast_rider(self, train_id: str, message: dict):
        conns = self.rider_connections.get(train_id, set())
        dead = []
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect_rider(train_id, ws)

    # ---- shared operations channel (frontend handoff spec Section 28) ----
    async def connect_operations(self, ws: WebSocket):
        await ws.accept()
        self.operations_connections.add(ws)

    def disconnect_operations(self, ws: WebSocket):
        self.operations_connections.discard(ws)

    async def broadcast_operations(self, event: str, payload: dict):
        import time as _time
        message = {
            "event": event,
            "timestamp": _time.strftime("%Y-%m-%dT%H:%M:%SZ", _time.gmtime()),
            "payload": payload,
        }
        dead = []
        for ws in self.operations_connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect_operations(ws)
