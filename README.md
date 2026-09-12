# TransitResilience Platform

Read in this order:
1. [`SMARTER_MOVEMENT_MASTER_SPEC.md`](./SMARTER_MOVEMENT_MASTER_SPEC.md) — the system design.
2. `../TransitResilience_Technical_Deep_Dive.md` — why each model/tool was chosen (XGBoost, CP-SAT, etc).
3. [`technical.md`](./technical.md) — how the React frontend is built and wired to the backend. Start here if you're new to the codebase.

## Backend setup

```bash
python -m venv .venv
source .venv/Scripts/activate      # .venv\Scripts\activate on native Windows shells
pip install -r requirements.txt
python data/generate_synthetic_world.py   # one-time, or after changing calibration
python ml/eta_model/train.py              # one-time, or after changing the training data
uvicorn backend.api.app:app --reload
```
Backend runs at http://localhost:8000.

## Frontend setup (the real UI — see technical.md)

```bash
cd frontend
npm install
npm run dev
```
- Passenger app: http://localhost:5173/
- Operations console: http://localhost:5173/admin

## Two-device demo (admin on laptop, passenger on phone)

The app derives the backend address from whatever address you opened it on, so this works with no config — as long as you start both servers with `--host` and use your laptop's LAN IP.

1. **Find your laptop's IP** (PowerShell): `ipconfig` → look for "IPv4 Address" under your Wi-Fi adapter, e.g. `192.168.1.42`.
2. **Start the backend bound to all interfaces:**
   ```powershell
   uvicorn backend.api.app:app --reload --host 0.0.0.0 --port 8000
   ```
3. **Start the frontend the same way:**
   ```powershell
   npm run dev -- --host
   ```
4. **On the laptop** open `http://localhost:5173/login` → sign in as `admin`.
5. **On the phone** (same Wi-Fi) open `http://192.168.1.42:5173/login` → sign in as `user`.

Both connect to the same `/ws/operations` channel. Approve a plan on the laptop and the phone updates instantly, with no refresh.

**If the phone can't connect:** Windows Firewall is usually the culprit — allow Python and Node on private networks, or temporarily allow ports 8000 and 5173. Both devices must be on the same network (phone hotspot works too — connect the laptop to the phone's hotspot).

**Do not** create a `frontend/.env` with `VITE_API_BASE_URL=http://localhost:8000` — that hardcodes localhost and breaks the phone, which would then look for a backend on itself.

## Legacy static UI (kept as a fallback, not the primary UI)

The original plain-HTML/JS admin+rider pages still work at http://127.0.0.1:8000/admin and http://127.0.0.1:8000/ (served directly by the backend, no npm needed) — useful if you just want to poke the API without running the React dev server.

## What's verified working end to end (as of this build)

Injecting rainfall via the admin slider (`POST /api/anomaly`) → the XGBoost ETA model predicting a disruption with a full SHAP-based explanation → the NetworkX propagation graph finding the downstream headway cascade → the OR-Tools CP-SAT optimizer producing a feasible plan (bus diversion, EV-preferred, with a CO2-avoided estimate) → a tiered human-in-the-loop candidate → admin approval → the affected rider's WebSocket channel receiving the filtered `plan_approved` payload (route, new ETA, effective-from time, one-line reason) instantly.

## Known rough edges to pick up next

- Only rainfall/segment-risk disruptions currently drive `_trigger_replan` in `backend/sim/world.py` — the incident classifier (`backend/event_bus/incident_classifier.py`) writes into `manual_incident_boost` but nothing yet reads the autonomous shuttle's reactive path-planner or the road congestion layer into a re-plan trigger. Wire those in next.
- The admin "View" drill-down currently just surfaces whatever candidate exists for that train from `/api/candidates` — no per-train history view yet.
- Rider "trip history" (Section 9 of the spec) isn't built — only a live single active trip.
- No incident-verification queue UI yet (`source: news_nlp | crowd_report` events aren't distinguished in the frontend from `sensor`/`admin_injected` ones).
