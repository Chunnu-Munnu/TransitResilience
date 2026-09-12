# TransitResilience — The Whole System, Explained

**This is the only doc you need to read.** Every model, every library, every design decision, why it's there, which file it lives in — and at the end, **how to pitch it**.

Supporting docs: `SMARTER_MOVEMENT_MASTER_SPEC.md` (system design), `technical.md` (frontend wiring detail), `docs/DATA_SOURCES.md` (dataset provenance), `README.md` (run commands).

---

# PART 1 — WHAT IT IS

## 1.1 The one idea

> We don't report that a train is late. We predict it's **about to become** late, work out **who else it hits**, propose **what to do**, let a **human approve it**, and tell the **passenger** instantly — with a choice, not an order.

Five stages, looping forever:

```
PREDICT → CORRECT → PROPAGATE → OPTIMIZE → DECIDE
   ↑                                          │
   └──────────── new signal ──────────────────┘
```

Every file belongs to exactly one stage, plus the plumbing between them.

## 1.2 What makes it defensible

Most hackathon "AI transport" projects predict a number. This one closes the loop: prediction → cascade → optimization under uncertainty → human authority → passenger action. Each link is a different technique chosen for a specific reason, and **none of them is an LLM pretending to be an engineer**.

---

# PART 2 — THE DATA

## 2.1 What's genuinely real (`data/raw/`)

| Dataset | Source | Why |
|---|---|---|
| Mumbai rainfall, 2015–2024 daily | NASA POWER API (MERRA-2) | A **real** 10-year distribution to calibrate against |
| India Flood Inventory v3 | `hydrosenselab/India-Flood-Inventory` (IMD-collaborated) | 6,876 real flood events; **1,030 mention Maharashtra, 267 mention Mumbai** |
| District Flood Severity Index | `msaharia/India-flood-inventory-impacts` | Historical per-district severity |
| 14 Central Line stations | `datameet/railways` | **Real station codes + real GPS coordinates**, CST → Kalyan |

## 2.2 What's synthetic (`data/generate_synthetic_world.py`)

Train services and timetable, bus/EV fleet, charging stations, autonomous shuttle, road congestion, platform numbers.

## 2.3 Why synthetic — the honest answer

1. **The real data doesn't exist publicly.** Indian Railways does not publish minute-level suburban EMU delay logs. We looked. Kaggle's "train delay" datasets are long-distance express trains behind a login.
2. **The architecture is the contribution.** The loop is identical whether positions come from a live GPS feed or a simulation. Swap the ingestion, everything downstream is unchanged.

**But it isn't invented.** Rainfall fed to the model is **bootstrapped from the real NASA POWER series** (we sample actual recorded days), and the 64.5mm disruption threshold is **IMD's official "heavy rainfall" band**, which we verified occurs **~8 days/year** on this corridor in the real record.

> If asked "where did 64.5mm come from?" → *"It's IMD's official heavy-rainfall threshold, and we checked it against a real 10-year NASA record for these exact coordinates — it's crossed about 8 times a monsoon."*

## 2.4 Why this corridor

Real, documented monsoon waterlogging (Kurla, Dadar, Thane–Mumbra–Diva). 14 stations is enough to show a multi-hop cascade without cluttering a map. Coordinates are public and verifiable.

---

# PART 3 — THE FIVE STAGES

## 3.1 PREDICT — hazard scoring
**File:** `backend/sim/world.py::segment_flood_risk()`

```python
excess = max(0, rainfall_mm - 64.5)          # past IMD's "heavy" band
risk = min(1.0, excess/100 + segment_base_risk)
```
`segment_base_risk` (0.03 / 0.08 / 0.15) reflects each segment's documented waterlogging history.

**Why a formula, not a hydrological model?** Real flood nowcasting needs terrain rasters, drainage models, serious compute — weeks of work that changes *nothing* downstream, because the ETA model just consumes a 0–1 score. Swap it later without touching a line of prediction or optimization code.

### The look-ahead — what makes this prediction, not reporting
**File:** `world.py::risk_ahead()`

Scans the next **3 segments** ahead of each train, returns the worst risk and **how many minutes until that train reaches it** (from its real speed and mid-segment progress). *That* is what feeds the model and triggers re-plans.

- Reporting: *"this train is on a flooded segment and is now late."*
- Predicting: **"T101 is 18 min from CLA-GC where risk is 100%. It is NOT yet delayed."**

The second is what the system actually prints. *(This was a genuine bug for a while — the feature was named `flood_risk_ahead` but fed the current segment's risk, so closing a track ahead of a train did nothing until it arrived. Worth knowing: a name and a behaviour had drifted apart.)*

## 3.2 CORRECT — the ETA model (XGBoost)
**Files:** `ml/eta_model/train.py`, loaded in `world.py`

**What XGBoost is:** Gradient-Boosted Decision Trees. Your first guess is bad, so you build a small tree that fixes the worst mistakes ("high flood risk ahead + dropping speed → +20 min"). Then a second tree fixes what the first left behind. Stack 200 small corrections → one strong predictor.

**Features:** `current_delay_min, flood_risk_ahead, road_congestion_index, hour_of_day, segment_base_risk, rainfall_mm`

**Key design decision:** `flood_risk_ahead` is a **model feature**, not a warning banner bolted on afterwards. That's what "hazard-aware ETA" means.

**Why XGBoost, not a neural net?**
- **Tabular data** — GBDTs match or beat neural nets here; deep learning wins on images/text/audio.
- **Small data** — 6,000 rows. A neural net overfits; GBDTs are comfortable.
- **Explainability** — XGBoost gives exact per-prediction, per-feature contributions. Our entire human-in-the-loop design depends on the operator seeing a real reason.
- **Speed** — trains in seconds, predicts in <1ms. We re-predict 12 trains every 2 seconds.

**Results:** test MAE **2.5 minutes**; `flood_risk_ahead` carries **84% of feature importance** — the model independently found that hazard-ahead dominates.

**Honest framing:** the training target comes from a known formula, so we're teaching it a relationship we defined. It's a vertical slice with a real architecture — retrain on real logs and nothing else changes. What it genuinely proves is that the pipeline and the explainability machinery work.

## 3.3 Explainability — "why +38 min?"
**File:** `ml/explainability/explain.py`

Uses XGBoost's own `predict(pred_contribs=True)` → **SHAP values**: exactly how many minutes each feature contributed. Computed by TreeSHAP inside XGBoost, so **no extra library**.

```
Predicted additional delay: 50 min.
  flood risk on the segment ahead: +39 min
  current rainfall intensity: +1 min
```

**Why no LLM here?** An LLM would *narrate* a plausible reason. SHAP *computes* the actual contribution from the model's own structure. For an operator approving real train movements, those are completely different claims.

## 3.4 PROPAGATE — the cascade
**File:** `backend/propagation/graph.py`

A **graph** = dots (trains) + lines ("follows on the same track").

If T101 is 45 min late and T102 runs 12 min behind: `12 − 45 = −33`, below the 5-minute safe gap, so T102 inherits delay. Then the same test runs on T103 behind it, walking forward until a gap absorbs what's left.

Real output: one 44-min delay cascaded into **six** trains (+37, +30, +23, +16, +9, +2), each with its exact arithmetic recorded.

**Why a graph library?** Chain length is unknown — it depends on delay size and timetable. Graph traversal handles any depth without depth-specific code. Published Dutch railway research found the same: cascades are *network-structural*.

## 3.5 OPTIMIZE (1) — the constraint solver
**File:** `backend/optimizer/reoptimize.py`

- **OR-Tools** — Google's Operations Research library.
- **CP** = Constraint Programming — you describe *variables* and *constraints*, not an algorithm. The solver searches.
- **SAT** = Boolean Satisfiability — internally converts to true/false clauses, solved by engines originally built for chip verification.

**What it decides:**
1. **Hold minutes** per conflicting train (≥ the headway requirement the graph computed).
2. **Which buses** absorb stranded passengers, subject to: capacity ≥ 120 passengers; depot within 3 segments; **EV buses can't exceed free charging bays**; and **no buses at all if the parallel road is closed**.
3. **Objective:** minimise `bus_cost×10 + total_hold`, with diesel weighted **3× EV** — so it *prefers EV* unless infeasible. That's where "greener" comes from: a real constraint, not a slogan.

**Why a solver, not ML?** **ML predicts the future; a solver decides the plan.** A double-booked platform isn't "slightly wrong" — it's physically impossible. CP-SAT guarantees every constraint holds or reports infeasible. And because we know which constraints bound the solution, the operator's justification is generated from them.

**A real bug worth mentioning:** hold variables were capped at 15 minutes, but a cascade needed 32 → model **infeasible**, no plan returned. The solver didn't silently return something wrong; it correctly said no valid answer existed.

## 3.6 OPTIMIZE (2) — robustness under an uncertain forecast
**File:** `backend/optimizer/robust.py` — **the piece that answers "what if the forecast is off?"**

CP-SAT optimises for *one* forecast. But we don't know when the flood actually arrives. So:

1. **Margin** — `compute_margin()`: `onset − current_delay − 5min buffer`.
2. **Corridor budget + decay** — `corridor_budget()`: `40 min × 0.85^hops`. Hops nearer the hazard tolerate less.
3. **Cascade simulator** — reuses the NetworkX propagation (not duplicated).
4. **4 candidate actions × 10 Monte Carlo scenarios** — `hold_5min`, `hold_15min`, `speed_restrict`, `reroute_via_bus`, each replayed with onset perturbed **±10 random minutes**.

**Ranking:** first by *how often it stays inside budget*, then by **worst-case**, deliberately **not average**. That's the whole point — optimise against the bad scenarios.

Real output:
```
CHOSEN: Reroute passengers via bus
  Leaves about 6 min of delay (697 passenger-minutes lost).
  Kept delay under the 40-min limit in 10 of 10 timings.
Next best was hold the train 15 minutes — about 29 min, roughly 24 min worse — held up in 7 of 10 timings.
We judge options by their WORST timing, not their average.
```

## 3.7 The event layer — why everything is pluggable

Every disruption normalises into **one shape**:
```json
{ "type": "flood|traffic|maintenance|ev_outage|incident",
  "location": "...", "severity": 0.0, "onset_minutes": 0,
  "duration_minutes": 0, "source": "sensor|admin_injected|news_nlp|crowd_report" }
```
The ETA model, graph and optimizer never ask *"is this a flood or a fight or a dead charger?"* — only *"what changed, where, how badly?"*

**This is the difference** between a flood-aware train tool (one product) and a disruption-aware platform (the whole track). A sixth data source is "write one adapter," never "rewrite the optimizer."

## 3.8 The incident classifier — the only LLM in the system
**File:** `backend/event_bus/incident_classifier.py`

Two implementations, one function:
1. **Keyword classifier** — zero dependencies, instant, always available.
2. **Gemini** (`gemini-3.6-flash`, called over plain `urllib` — no SDK) — reads free text, returns `{"type", "severity"}`.

Any failure (bad key, network, quota, bad JSON) **silently falls back to keywords**. Verified: a waterlogging report returned `{'type':'flood','severity':0.7,'classified_by':'gemini'}`.

**Why an LLM here and nowhere else?** Understanding messy human language is exactly what LLMs are for. Deciding how long to hold a train is not — that needs guarantees. The LLM sits at the **sensing edge** and never touches a scheduling decision or an ETA explanation.

**Security:** key in `.env` (gitignored), loaded by `backend/config.py`. Not hardcoded, not committed. **Rotate it after the hackathon** — it was pasted in a chat.

## 3.9 DECIDE — human-in-the-loop
**File:** `backend/approval/workflow.py`

The optimizer **never applies anything**. It emits a *candidate*; a person decides.

- **Tiers:** severity <0.10 auto-applies (effectively never); 0.10–0.70 supervisor; ≥0.70 senior, no timeout.
- **SLA timeout:** 600s — long enough that nothing is ever auto-approved behind your back during a demo.
- **Audit trail:** every submit/approve/reject with actor + timestamp → **Decision Log** page via `GET /api/audit`.
- **UI:** a proposed plan **interrupts** the operator with a modal (`ApprovalModal.jsx`). A plan nobody notices is functionally the same as no human in the loop.

**Why this isn't a cop-out:** it maps to the **Sheridan–Verplank levels of automation** (1978), a 10-point scale from manual to fully autonomous. Real transport control systems deploy at the middle: *"the computer suggests, the human decides."* Peer-reviewed railway rescheduling research does the same. This is the industry-validated design point.

## 3.10 Recovery — the hole we closed
Once flagged `at_risk`, trains used to stay that way forever. Now, when nothing hazardous is ahead, a train **works off its delay** (`RECOVERY_MIN_PER_TICK`) and returns to `on_time`. Blockages also **auto-expire** after their set duration and log a "reopened" event — so the demo can't get stuck with every segment permanently shut.

---

# PART 4 — THE INTERFACES

## 4.1 WebSockets
**Files:** `backend/websocket/manager.py`, `frontend/src/services/websocket.js`

Normal apps **poll** ("anything new?") — wasteful and stale. A **WebSocket** is a persistent two-way connection: the server pushes the instant something happens.

Typed events on `/ws/operations`: `SIMULATION_UPDATED` (every tick — train positions + segment risk), `HAZARD_UPDATED`, `ETA_UPDATED`, `PLAN_GENERATED`, `PLAN_APPROVED`, `PLAN_REJECTED`, `SERVICE_UPDATED`, `IMPACT_UPDATED`.

One operator click → the same event reaches the operator's console **and** every passenger's phone. That's the centrepiece, and it works because both dashboards subscribe to one channel and run one reducer.

## 4.2 The map
**Files:** `frontend/src/components/map/*`

- **Leaflet**, not Google/Mapbox: open-source, **no API key, no billing, no quota** — nothing breaks because a trial expired.
- **Standard OpenStreetMap tiles** — full colour. *(We tried CartoDB's dark basemap; it rendered nearly monochrome, so we switched.)* Attribution shown, as the licence requires.

**Five layers**, each answering one question: `StationLayer` (dots) → `TrackLayer` (line coloured by risk; closed segments render as a thick broken dark-red line) → `HazardLayer` (translucent circle, CSS-pulsing above 70%) → `RerouteLayer` (dashed before approval, solid after) → `TrainLayer` (drawn last, sits on top).

**Two details worth knowing:**
- **Smooth movement:** backend says "40% through segment 3"; `trainPosition()` interpolates between the two real station coordinates. That's why trains glide.
- **The `VIA_ROAD_` trick:** our corridor is one rail line, so a "reroute" means "bus around the closed segment." The backend inserts a synthetic `VIA_ROAD_<segment>` waypoint and `resolveRouteCoords()` offsets it perpendicular from the segment midpoint — so a detour *looks* like a detour without hand-authoring road geometry.

## 4.3 Passenger UX — choice, not orders
The passenger bought a **train** ticket, so **"Stay on your train" is always the first option**, with its honest delay. The bus is offered as an **alternative** with its own number. Choosing the bus requires a **second explicit confirmation** showing platform, walking distance and where they rejoin — nobody gets off a train by accident.

The itinerary lives in its own always-visible column, marks the change point with the platform, and shows bus-leg stops distinctly.

## 4.4 Frontend state
**File:** `frontend/src/state/operationsStore.jsx`

React **Context** + a **reducer** (`(state, action) => newState`). You never mutate; you `dispatch` and get a new state object. One `PLAN_APPROVED` event → reducer flips status → React re-renders the map route, the approval card, and the passenger alert. You wrote none of that re-rendering.

**The rule:** the React app **never decides anything**. No `if (risk > 0.8) reroute()` anywhere. It renders backend state and forwards clicks. All logic is Python.

## 4.5 Auth — deliberately fake
**File:** `frontend/src/state/authStore.jsx`. Hardcoded `user/user` and `admin/admin` in `sessionStorage`.

**This is not security** — the credentials are in the source. Its only job is role-gating so the two experiences demo distinctly. Say that plainly if asked; claiming otherwise is what a judge will catch.

---

# PART 5 — FILE MAP (where everything lives)

### Backend
| File | What it does |
|---|---|
| `data/generate_synthetic_world.py` | Builds corridor, trains, roads, fleet, chargers, shuttle, platforms; calibrates thresholds from real rainfall |
| `ml/eta_model/train.py` | Trains the XGBoost ETA model |
| `ml/explainability/explain.py` | SHAP contributions → operator + passenger explanations |
| `backend/sim/world.py` | **The heart.** Live loop, look-ahead risk, replan trigger, recovery, blockages, passenger options, broadcasting |
| `backend/propagation/graph.py` | NetworkX cascade detection (headway violations) |
| `backend/optimizer/reoptimize.py` | CP-SAT: holds + bus/EV assignment under real constraints |
| `backend/optimizer/robust.py` | Monte Carlo robustness: margin, budget, 4 actions × 10 scenarios |
| `backend/approval/workflow.py` | Tiers, SLA timeout, audit log |
| `backend/event_bus/incident_classifier.py` | Free text → event (Gemini, keyword fallback) |
| `backend/websocket/manager.py` | Connection registry + typed broadcasting |
| `backend/api/app.py` / `operator.py` | REST + WebSocket endpoints |
| `backend/config.py` | `.env` loader (Gemini key) |

### Frontend
| File | What it does |
|---|---|
| `app/App.jsx`, `routes.jsx`, `RequireRole.jsx` | Providers, routing, role gate |
| `state/operationsStore.jsx` | The single live-state store |
| `state/authStore.jsx` | Demo-only login |
| `services/api.js`, `websocket.js` | REST + socket (auto-reconnect, LAN host derivation) |
| `utils/eta.js` | All ETA maths + 12-hour clock formatting |
| `components/map/*` | The five map layers + geometry helpers |
| `components/admin/ApprovalModal.jsx` | **The human-in-the-loop gate** |
| `components/admin/PropagationGraph.jsx` | The delay cascade chart |
| `components/admin/BlockageControls.jsx` | Close/reopen tracks and roads |
| `components/admin/RecommendationPanel.jsx` | Approve / Adjust / Reject |
| `components/user/TrainPickerModal.jsx` | Board → destination → pick your train |
| `components/user/PassengerAlertModal.jsx` | Two options, bus needs confirmation |
| `components/user/MyTripPanel.jsx`, `ItineraryPanel.jsx` | Trip status + stop-by-stop plan |
| `pages/*` | AdminDashboard, ScenarioControl, DecisionLog, UserDashboard, Login |

---

# PART 6 — HOW TO PITCH IT

## 6.1 The 30-second version

> "Indian rail loses entire monsoon days to flooding, and today the response is reactive — a train gets stuck, *then* someone reacts. TransitResilience predicts the delay **before it happens**, shows exactly which other trains it will hit, tests several fixes against an uncertain forecast, and hands a control-room operator a recommendation they approve or reject. The moment they approve, every affected passenger's phone updates with what to do. We built it on the real Mumbai Central Line with real rainfall data."

## 6.2 The demo script (5 minutes, in this order)

**1. Open both screens.** Laptop = operator console. Phone = passenger app. Say: *"Same backend, one WebSocket, two audiences."*

**2. Show normal state.** 12 trains moving, all green. *"Real Central Line stations, real coordinates."*

**3. Inject the anomaly.** Scenario Control → Inject Rainfall Anomaly ~120mm. Say: **"64.5mm is IMD's official heavy-rain threshold — we verified against a real 10-year NASA record that this corridor crosses it about 8 days a year."**

**4. The money moment.** Point at the console: **"T101 is 18 minutes from Kurla–Ghatkopar, risk 100%. It is NOT late yet. This is a forward prediction."** ← *This single line is your whole pitch.*

**5. Show the cascade.** The delay chart. *"One delay, six trains, each with the exact headway arithmetic. Cascades are structural — you can't see them by looking at one train."*

**6. Show robustness.** The scenario bars. *"We don't know exactly when the water hits. Four options replayed against ten timings. Reroute wins — not because it's best on average, but because it's best in the **worst** case."*

**7. The human gate.** The approval modal. *"The AI never applies anything. This is the Sheridan–Verplank middle ground — computer suggests, human decides. Every decision is logged."* → Click **Approve**.

**8. Switch to the phone.** It has already updated. *"No refresh. One WebSocket event reached both screens."* Show the two options: **"They bought a train ticket, so staying on the train is the default. The bus is a suggestion — and choosing it needs a second confirmation with the platform and walking distance."**

**9. Close the loop.** Close a road segment. *"Now the bus option disappears entirely and the optimizer falls back to holds — because the constraint is real, not decorative."*

## 6.3 The four hard questions, and your answers

**"Isn't your data fake?"**
> "The corridor, coordinates, rainfall and flood history are real. The train movements are simulated because Indian Railways doesn't publish minute-level suburban delay logs — we checked. But every component downstream of ingestion is identical either way. Swap the feed, nothing else changes."

**"Why not use an LLM for all of this?"**
> "We use one — for reading free-text incident reports, which is what language models are genuinely good at. But an LLM can't guarantee a platform isn't double-booked. That's why scheduling is a constraint solver, and why explanations are SHAP values computed from the model's own structure rather than a sentence an AI wrote."

**"What's actually novel?"**
> "Not any single component. It's the closed loop: hazard → prediction → cascade → optimization under uncertainty → human authority → passenger action. Japan does predictive maintenance, the Dutch model delay graphs, Singapore runs fleet prediction — nobody joins them end to end with a human gate in the middle."

**"Does this scale beyond rail?"**
> "The event layer is disruption-agnostic. A flood and a dead EV charger are both 'a constraint that changed.' That's why the same engine already covers traffic, fleet ops, EV charging and last-mile shuttles."

## 6.4 What NOT to claim

- Don't say the auth is real. It's hardcoded.
- Don't say the flood model is hydrological. It's a calibrated formula.
- Don't say the ETA model learned from real delay logs. It didn't — say "vertical slice, real architecture."
- Don't call the cost numbers rupees. They're a ranking score.
- Don't claim live railway integration.

**Being precise about limits is what makes the rest credible.** A judge who catches one overclaim will doubt everything else.

---

# PART 7 — GLOSSARY

- **GBDT / XGBoost** — many small decision trees, each correcting the last one's errors.
- **SHAP values** — per-prediction, per-feature contribution in real units (minutes).
- **MAE** — Mean Absolute Error. Ours: 2.5 minutes.
- **Feature importance** — overall reliance on each input. Ours: 84% flood risk.
- **Graph / NetworkX** — nodes and edges; here trains and "follows" relationships.
- **CP-SAT** — Constraint Programming on a Boolean SATisfiability engine. Describe rules, it finds a valid answer.
- **Constraint / Objective** — what must be true / what we minimise.
- **Monte Carlo** — many randomised trials; judge by the distribution, not one number.
- **Worst-case vs average** — we optimise against bad scenarios, not typical ones.
- **Headway** — minimum safe time gap between consecutive trains (5 min here).
- **Event schema** — the one shape every disruption normalises into.
- **WebSocket vs polling** — server pushes instantly vs client repeatedly asking.
- **React Context / reducer** — shared state box / the only function allowed to change it.
- **Leaflet / OSM** — open-source map library / free imagery, no API key.
- **Interpolation** — computing a position between two known points (why trains glide).
- **SLA timeout** — auto-approve trivial plans if no human responds in time.
- **Sheridan–Verplank levels** — the 1978 automation scale; we sit mid-scale deliberately.
