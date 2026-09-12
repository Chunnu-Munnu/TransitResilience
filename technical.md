# TransitResilience — Technical Guide (Frontend + Wiring)

This teaches you the React frontend that was just built, how it talks to the backend, and how every piece of the "hazard → approval → passenger update" story is actually wired in code. Read this alongside `SMARTER_MOVEMENT_MASTER_SPEC.md` (the system design) and `../TransitResilience_Technical_Deep_Dive.md` (the ML/OR-Tools "why this model" doc) — this file is the missing third piece: how the UI layer works.

---

## 1. How to run it (VS Code)

Open the **`TransitResilience-Platform`** folder in VS Code (not the parent `Aura Hackathon Project` folder — that has other, older drafts in it).

**Terminal 1 — backend** (View → Terminal, then a new terminal):
```bash
source .venv/Scripts/activate      # Windows Git Bash / VS Code integrated terminal
uvicorn backend.api.app:app --reload
```
Leave this running. It serves the API on `http://localhost:8000` and the old plain-HTML admin/rider pages at `/admin` and `/` (kept as a fallback, not the primary UI anymore).

**Terminal 2 — frontend** (split terminal or a second one):
```bash
cd frontend
npm run dev
```
Open the URL it prints — `http://localhost:5173/` for the passenger app, `http://localhost:5173/admin` for the operations console.

That's it — two terminals, two `npm`/`uvicorn` processes, no build step needed for development. (`npm run build` in `frontend/` produces a static `dist/` you could later have FastAPI serve directly, but for now the two dev servers talking over CORS is the setup, matching the `.env` file's `VITE_API_BASE_URL`/`VITE_WS_URL`.)

**If you use VS Code's Run/Debug panel instead of typing commands:** there's no launch.json committed (deliberately — two plain terminals are simpler for a hackathon than debug configs), but you can create one later if you want F5 to start both.

---

## 2. The big picture: who talks to whom

```
React app (Vite, :5173)                    FastAPI backend (:8000)
┌─────────────────────┐   REST (fetch)     ┌──────────────────────┐
│ AdminDashboard.jsx   │ ─────────────────► │ backend/api/operator.py│
│ UserDashboard.jsx    │ ◄───────────────── │ (approve/reject/etc) │
│                      │                    │                      │
│                      │  WebSocket         │ backend/sim/world.py │
│                      │ ◄═══════════════════│ (the live sim loop) │
└─────────────────────┘  /ws/operations    └──────────────────────┘
```

Two channels, two purposes (Section 45 of the frontend spec: *"backend authoritative state → REST initial load → WebSocket events → frontend store → UI"*):

- **REST** is for *commands* — "approve this plan," "search a trip," "set rainfall to 80mm." Each is a one-off request/response.
- **WebSocket** (`/ws/operations`) is for *state that changes on its own* — train positions every tick, a new hazard appearing, a plan being approved by someone else. The frontend never polls for this; the backend pushes it the instant it happens.

**The rule that keeps this honest (Section 31):** the React app never decides anything. It never runs `if (floodRisk > 0.8) reroute()`. Every decision — the ETA prediction, the optimizer's plan, the validation of an adjustment — happens in Python, in `backend/`. React only renders whatever the backend says and forwards button clicks as REST calls. If you ever catch yourself writing business logic in a `.jsx` file, that's a sign it belongs in the backend instead.

---

## 3. The React app, folder by folder

```
frontend/src/
├── app/            → App.jsx wraps everything in providers + the router; routes.jsx picks admin vs user by URL
├── state/          → operationsStore.jsx — the ONE place all live data lives
├── services/       → api.js (REST calls) and websocket.js (the socket connection)
├── hooks/          → thin, reusable slices of the store for components to consume
├── components/
│   ├── map/        → Leaflet layers (see Section 5 below)
│   ├── admin/      → operations-console-only widgets
│   ├── user/       → passenger-app-only widgets
│   ├── shared/     → used by both (Header, StatusBadge, MetricCard, Notification)
│   └── layout/     → the page skeleton (header + 3-column grid + footer)
├── pages/          → AdminDashboard.jsx and UserDashboard.jsx — these assemble
│                     components into the actual screens; almost no logic of their own
└── data/map/       → the static GeoJSON of the 14 real stations
```

**Why this split matters, not just "convention":** `pages/` files are deliberately dumb — they just pick which components go where. All the real interactivity (what happens when you click Approve) lives one level down in `components/admin/RecommendationPanel.jsx`. This means you can rearrange the *layout* (move a panel from the right column to the left) without touching any logic at all — you're just moving a JSX tag in the page file.

---

## 4. State management: `operationsStore.jsx`, explained like you've never used React Context

**The problem it solves:** dozens of components (the map, the train list, the recommendation card, the footer) all need to know "what are the trains doing right now." Passing that data down as props through every layer would be miserable — this is called "prop drilling." React Context solves this by letting any component reach directly into a shared box of data, no matter how deeply nested it is.

**The three pieces:**
1. **`initialState`** — the shape of the box. Look at it: `trains: []`, `hazards: []`, `recommendations: []`... This is *exactly* the shape the frontend spec asked for in Section 44.
2. **`reducer(state, action)`** — the *only* function allowed to change the box. You never mutate state directly (`state.trains.push(...)` is forbidden); instead you call `dispatch({ type: "WS_EVENT", message })` and the reducer computes a *brand new* state object. This is the core React/Redux-style pattern: state changes are explicit, traceable events, not silent mutations. If something looks wrong, you can find every place that could have caused it by searching for `dispatch(`.
3. **`useOperations()`** — the hook any component calls to read the box (`const { state } = useOperations()`) or to change it (`dispatch(...)`).

**Walk through one real event, end to end:** the backend approves a plan and sends `{"event": "PLAN_APPROVED", "payload": {...}}` over the WebSocket. `useOperationsSocket.js` receives it and calls `dispatch({ type: "WS_EVENT", message })`. The reducer's `switch (event)` matches `"PLAN_APPROVED"`, finds the matching recommendation by `plan_id`, and returns a new state where that recommendation's `status` is now `"approved"`. React notices the state changed and re-renders every component that reads `state.recommendations` — the map redraws the route as solid, the recommendation card shows "APPROVED," the passenger's Service Alerts card shows the new route. **You didn't write any of that re-rendering logic** — that's the point of the store: one dispatch, everything downstream updates itself.

---

## 5. The map: why five small layer components instead of one big one

`NetworkMap.jsx` doesn't draw anything itself — it just stacks five children on top of the OpenStreetMap tiles, in a specific order (later = drawn on top):

1. **`StationLayer`** — the 14 dots. Never changes.
2. **`TrackLayer`** — the rail line itself, colored per-segment by flood risk. This *is* Section 9's "current route, solid line" — it's always drawn, using real risk data from the backend.
3. **`HazardLayer`** — a translucent circle over a risky segment. Separate from the track line because a hazard is a *zone*, not a line — Section 8 explicitly asks for hazards to be visible "geographically, not only numerically." Circles ≥70% risk get the `hazard-pulse` CSS animation class (see `globals.css`) — a real technique (Leaflet's vector layers accept a `className` option, so a plain CSS `@keyframes` handles the pulsing, no JS animation loop needed).
4. **`RerouteLayer`** — the dashed/solid proposed-or-approved detour. This is the trickiest one: our simulated corridor is a single rail line, so a "reroute" is really "get off the train, take a bus around the flooded segment, get back on." The backend represents this as a route array with a synthetic `VIA_ROAD_<segment>` entry spliced in (see `backend/sim/world.py`'s `route_stations()`). `mapGeo.js`'s `resolveRouteCoords()` turns that fake station code into a real coordinate by offsetting perpendicular from the segment's midpoint — enough to visually read as "a detour," without needing us to hand-author real road geometry.
5. **`TrainLayer`** — drawn last, so train dots always sit on top of everything else. Each train's position is *interpolated*: the backend gives you "I'm 40% of the way through segment 3," and `trainPosition()` in `mapGeo.js` does simple linear interpolation between that segment's two station coordinates. This is why train movement looks smooth even though the backend only sends an update every 2 seconds.

**Why five files instead of one 300-line component?** Each layer answers one question from the spec (Section 6's "Layer 1/2/3" architecture) and can be reasoned about alone. If the hazard circles look wrong, you know to open exactly one file.

---

## 6. The Approve / Adjust / Reject flow, traced through the actual code

This is "the centerpiece" (Section 50), so it's worth tracing completely.

1. **Something happens:** rain crosses the real 64.5mm threshold on a segment. The backend's sim loop (`world.py`, `_advance_train`) calls the XGBoost model, gets back a predicted delay, and — because it's over 15 minutes — calls `_trigger_replan()`.
2. **The optimizer runs** (`backend/optimizer/reoptimize.py`, CP-SAT) and produces a `Plan`: which trains need holding, which buses get dispatched, whether it's even feasible.
3. **A `Candidate` is created** (`backend/approval/workflow.py`) with a tier (auto/supervisor/senior) based on severity, and the backend broadcasts `PLAN_GENERATED` over `/ws/operations`.
4. **React receives it:** the reducer adds it to `state.recommendations`. `AdminDashboard.jsx` computes `activeRecommendation` (the pending one for the selected train, or the first pending one) and passes it to `RecommendationPanel`.
5. **The admin clicks a button** in `RecommendationPanel.jsx`:
   - **Approve** → `api.approvePlan(plan.plan_id)` → `POST /api/operator/decision/{plan_id}/approve` → the backend applies the plan *immediately* (not waiting for the next simulation tick — look at `await _world._apply_plan(decided)` in `operator.py`) and broadcasts `PLAN_APPROVED`, `SERVICE_UPDATED`, and `IMPACT_UPDATED`.
   - **Adjust Plan** → switches to `AdjustPlan.jsx`, which lets the admin edit hold minutes per downstream train, then calls `api.validatePlan()`. This hits `POST /api/operator/validate`, which runs `world.validate_adjustment()` — a genuinely real check: it compares your proposed hold against the minimum headway the propagation graph actually requires, not a fake always-pass response. If you under-hold, you get back a real "PLAN INVALID" with the exact reason (Section 19).
   - **Reject** → a one-field confirmation, then `POST /api/operator/decision/{plan_id}/reject`.
6. **The moment approval lands**, the `PLAN_APPROVED` event reaches *every* connected client — including a passenger's browser tab open on `UserDashboard.jsx` — over the same `/ws/operations` socket. No refresh, no second request. Their `ServiceAlerts.jsx` card and the map's `RerouteLayer` update from the exact same event the admin's screen just processed.

That last point is the whole "real-time synchronization" requirement (Section 28) working end to end, and it only works because both dashboards subscribe to the *same* channel and run through the *same* reducer.

---

## 7. A note on the two WebSocket designs in this codebase

You'll notice `backend/websocket/manager.py` has *two* broadcasting mechanisms: the older `admin_connections` / `rider_connections` (used by the original plain-HTML pages, kept for backward compatibility) and the new `operations_connections` (used by this React app, per the frontend handoff spec). They're not in conflict — they're just two different design philosophies:

- **Old design:** the *server* filters what a rider sees (a rider only ever receives route/ETA/reason for their own train — nothing else). More private, more bandwidth-efficient.
- **New design (what you asked for):** *one* shared firehose of typed events (`HAZARD_UPDATED`, `PLAN_APPROVED`, etc.), and the *client* decides what to render — `UserDashboard.jsx` simply chooses not to display tier/severity/constraint-trace fields that arrive in the same payload an admin sees.

Both are legitimate; the new one is simpler to extend (one channel, typed events) at the cost of sending passengers a bit more data than they strictly need. Worth knowing if a judge asks "why is there `/ws/rider/{train_id}` AND `/ws/operations`?" — it's not dead code, it's the evolution of the design, documented rather than silently deleted.

---

## 8. What's genuinely built vs. what's stubbed (Section 48/49 self-check)

Being direct about this, since overclaiming here would come back to bite you in front of a judge:

| Area | Status |
|---|---|
| Map: stations, tracks, hazards, trains, proposed/approved routes | **Built and wired to live backend data.** |
| Admin: overview, events, train list, details, recommendation, adjust, validate, reject, approve, impact, simulation controls | **Built and wired.** |
| User: live train list, map, alerts, journey search, service update on approval | **Built and wired.** |
| Synchronization: admin approval → user update, no refresh | **Built and verified** (tested directly against the running backend before the UI was built on top of it). |
| Speed control (1x/2x/5x) | **Built** — genuinely changes the backend's simulated-minutes-per-tick, not a cosmetic label. |
| Maintenance upload / driver hardware event | **Backend endpoints exist and work**; there's no dedicated upload-file UI button yet — they're reachable via `api.uploadMaintenance()` / `api.reportDriverEvent()` but no component calls them yet. Low priority per Section 49. |
| Auth, roles, login | **Deliberately not built** — Section 49 explicitly excludes this from the MVP. |
| This whole React UI in a live browser | **Backend was tested directly via curl/WebSocket scripts, and `npm run build` compiles cleanly with zero errors.** I do not have a connected browser in this environment, so I have not visually seen the rendered pages — you're the first person to actually look at it. Please tell me what's broken and I'll fix it directly. |

---

## 9. A short glossary, since you said to teach you this

- **Component** — a JavaScript function that returns UI (JSX). `TrainList.jsx` is a component.
- **JSX** — HTML-looking syntax inside JavaScript (`<div>{train.id}</div>`). It compiles down to plain function calls; it's not actually HTML.
- **Props** — data passed *into* a component from its parent, like function arguments (`<TrainList trains={trains} />`).
- **Hook** — a function starting with `use` that lets a component tap into React features (state, context, side effects). `useOperations()`, `useState()`, `useEffect()` are all hooks.
- **Context** — React's built-in way to share data across many components without passing it down manually through every layer (Section 4 above).
- **Reducer** — a function `(state, action) => newState` that's the *only* place allowed to compute state changes. Comes from the same pattern Redux popularized.
- **Controlled component** — a form input (like our rainfall slider or Adjust Plan's number fields) whose value is driven by React state, not the browser's own memory — so React always knows the current value.
- **WebSocket** — see the deep-dive doc's Section 11 for the full explanation; short version, it's a persistent connection the server can push through any time, instead of the browser having to keep asking.
- **CORS** — a browser security rule that blocks a page on one origin (`localhost:5173`) from calling an API on another (`localhost:8000`) unless the API explicitly allows it. `app.add_middleware(CORSMiddleware, ...)` in `app.py` is what allows it here.
- **Vite** — the build tool serving the React app during development (`npm run dev`) and bundling it for production (`npm run build`). Fast because it serves your source files directly over ES modules instead of rebuilding a giant bundle on every change.
