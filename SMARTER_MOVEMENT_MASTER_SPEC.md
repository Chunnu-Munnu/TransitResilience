# TransitResilience — Master Spec
**Track 4 — Smarter Movement · Team VISION-X · PES University, Bengaluru**

This is the single source of truth. Everything built in this folder is built from this document. If chat and this file ever disagree, this file wins — update it first, then code.

---

## 0. The track, and the honest scorecard against it

The track brief names six things: **traffic management, route optimization, fleet operations, autonomous mobility, electric vehicle ecosystems, smart navigation** — in service of networks that are **safer, greener, more efficient**.

| Track pillar | What we actually build | What's demoed live vs. narrated |
|---|---|---|
| Route optimization | The CP-SAT optimizer *is* the core engine — platform/route reassignment under live constraints | **Live** |
| Traffic management | A parallel road-segment congestion layer feeding the map and the optimizer's bus-diversion decisions | **Live** (synthetic congestion, real road geometry) |
| Fleet operations | A synthetic EV/diesel bus fleet with depots, capacity, and driver availability as real optimizer constraints | **Live** (small scale: 6 buses) |
| EV ecosystem | Charging stations modeled as constrained resources exactly like platforms; a rough CO₂-avoided metric when a diversion picks EV over diesel | **Live** (3 stations) |
| Autonomous mobility | One scoped last-mile shuttle with a reactive path-planner reading the live risk score | **Live**, deliberately small (not a real AV stack) |
| Smart navigation | The rider itinerary planner + live trip-status app | **Live** |
| Safer | Platform-conflict count avoided; SOS/incident escalation path (described, stubbed) | Metric live, escalation path documented |
| Greener | CO₂-avoided estimate per approved plan that shifts riders to EV | **Live**, rough but real formula |
| Efficient | Passenger-minutes-lost, before/after every approved plan | **Live** |

Nothing in this table is aspirational without a data structure behind it — see Section 4.

---

## 1. The one-sentence idea

> We don't detect that a service is already late. We predict that it's *about to become* late, *why*, and *what should be done about it* — across rail, road, bus, EV, and last-mile shuttle — a human approves the plan, and the rider finds out instantly.

## 2. The four-stage loop

```
PREDICT  →  CORRECT  →  PROPAGATE  →  OPTIMIZE  →  DECIDE
   ↑                                                  │
   └──────────────────── new signal ─────────────────┘
```

Every disruption (flood, road congestion, a maintenance block, an EV charger outage, a news/crowd-reported incident) normalizes into one event shape (Section 3) before it enters this loop. The loop never cares what kind of disruption it is — see the Technical Deep Dive doc for the full "why" behind each stage's model choice; this spec only adds what's new since then.

## 3. The event schema (unchanged, still the backbone)

```json
{
  "type": "flood | traffic | maintenance | ev_outage | incident",
  "location": "segment_or_station_id",
  "severity": 0.0,
  "onset_minutes": 0,
  "duration_minutes": 0,
  "source": "sensor | admin_injected | news_nlp | crowd_report"
}
```

`source` is new in this spec — it's what lets the admin verification queue trust sensor/admin-injected events automatically and hold news/crowd events for review (Section 8).

---

## 4. The world being simulated

### 4.1 Rail corridor (real geography, synthetic operations)
14 real stations, Mumbai CST → Kalyan Jn, Central Line, real lat/lon (already extracted from `datameet/railways` into the old project — reused here as `data/raw/railway/mumbai_central_line_stations.csv`). 10–12 synthetic train services run stop-to-stop along it on a generated timetable.

### 4.2 Road/traffic layer — NEW, answers "traffic management"
A parallel road segment shadows each risky rail segment (e.g., the Eastern Express Highway alongside Kurla–Thane). Each road segment carries a synthetic congestion index (0–1) that the admin can also perturb, independent of rail flooding — so "traffic management" isn't just a sentence, it's a second live layer on the map with its own numbers.

### 4.3 Bus/EV fleet — NEW, answers "fleet operations" + "EV ecosystem"
6 synthetic buses (mixed EV/diesel), each with: home depot, capacity, current assignment, driver-on-shift flag. 3 charging stations near depots, each with bay count and current occupancy. When the optimizer diverts stranded rail passengers, it assigns them to specific buses from this fleet, subject to capacity and depot constraints — and if it picks an EV bus, that bus's post-trip charging demand becomes a real constraint at a real station.

### 4.4 Autonomous shuttle — NEW, answers "autonomous mobility"
One synthetic last-mile shuttle route (e.g., Kurla station → a residential loop) with two possible paths. A simple reactive rule — not a full AV stack — checks the live risk score on its primary path each cycle and switches to the secondary path if risk crosses threshold, logging why.

### 4.5 Incident/news feed — NEW, answers the earlier "fights/blockages" ask
A synthetic incident generator (admin can also manually inject one) produces short text events; a lightweight keyword/NLP classifier tags type + severity and writes them into the event schema with `source: news_nlp`. Designed to be swappable for a real news API later without touching anything downstream (Section 3's whole point).

### 4.6 Weather (real data, already downloaded)
The real 10-year NASA POWER rainfall series and the IMD-band thresholds computed from it (already in `docs/dataset_notes/DATA_SOURCES.md` in the old project) calibrate the synthetic rainfall generator here, so the numbers aren't arbitrary.

---

## 5. The models (full "why" for each is in `TransitResilience_Technical_Deep_Dive.md` — not repeated here)

| Stage | Model | Trained on |
|---|---|---|
| Hazard scoring | Rule-based formula, calibrated to real IMD rainfall bands | Real rainfall percentiles (Section 4.6) |
| ETA prediction | XGBoost regressor | Synthetic training set generated from the calibrated delay-formula (Section 4.6) — see `ml/eta_model/` |
| Delay propagation | NetworkX directed graph | Corridor + fleet + shuttle topology (Section 4) |
| Re-planning | OR-Tools CP-SAT | Live constraint set assembled per incident from all of Section 4 |
| Incident text | Keyword classifier (swappable for a transformer later) | Synthetic incident templates |

## 6. Explainability — three techniques, one paragraph out

1. **XGBoost → per-prediction contribution.** XGBoost's own `predict(pred_contribs=True)` returns exact SHAP-value contributions per feature per prediction — no separate library needed. This is what powers "flood risk ahead contributed +26 min."
2. **Propagation graph → conflict trace.** Read directly off which edge triggered the conflict.
3. **CP-SAT → active-constraint reporting.** Which constraints bound the solution, turned into a sentence by a small template layer.

All three feed one `explain()` call that returns both a full admin-length explanation and a one-line rider-length version (Section 9).

## 7. Human-in-the-loop (unchanged from prior discussion, restated for completeness)

The optimizer only ever emits a **candidate**. Tiered authority: minor re-timing auto-applies; platform/fleet reassignment needs a supervisor; full network re-plan needs senior sign-off. Low-severity candidates auto-approve on an SLA timeout; high-severity ones always wait. Every decision is logged (who, when, what they saw).

## 8. Real-time sync — two channels, one event

- `admin_channel` — full candidate detail, explanations, fleet/EV/shuttle state, the incident-verification queue.
- `rider_channel:{trip_id}` — only for a rider's own active trip. Derived from the same approval event, stripped to: **new route (if changed), new ETA, when the plan takes effect, one-line reason.** Nothing else reaches the rider.

Backend: FastAPI WebSocket endpoints, Redis pub/sub fan-out (or an in-process broadcaster for the hackathon scale — see `backend/websocket/`).

## 9. User panel — itinerary planning + minimal live status

- **Plan a trip**: pick origin/destination among the 14 stations, get the current best route + ETA.
- **Save as my trip**: subscribes to that service's `rider_channel`.
- **Live status card**: route, ETA, effective-from time, one-line reason — exactly the schema in Section 8, nothing more.
- **Trip history**: last few trips, for one-tap re-search of a regular commute.

## 10. Admin console

Map (Section 4.1–4.4, all layers), per-train/bus/shuttle list with a **View** drill-down (candidate plan, downstream impact table, feasibility, approve/reject), anomaly injector (rainfall slider, congestion toggle, manual incident text box), incident-verification queue (Section 3's `source` field gates this), audit log.

## 11. Folder structure

```
TransitResilience-Platform/
├── SMARTER_MOVEMENT_MASTER_SPEC.md   ← this file
├── .gitignore
├── requirements.txt
├── data/
│   ├── raw/                 # copied from the old project: real flood/rainfall/station data
│   └── synthetic/           # generated: corridor, trains, roads, fleet, chargers, shuttle, incidents
├── ml/
│   ├── hazard_model/
│   ├── eta_model/
│   └── explainability/
├── backend/
│   ├── event_bus/
│   ├── propagation/
│   ├── optimizer/
│   ├── approval/
│   ├── websocket/
│   ├── api/
│   └── sim/                 # the live simulation loop (moves trains, ticks time, applies anomalies)
├── frontend-admin/          # static HTML/JS + Leaflet, served by FastAPI
├── frontend-user/           # static HTML/JS, served by FastAPI
└── docs/
```

## 12. Build order

1. Copy real data in; generate synthetic corridor/roads/fleet/chargers/shuttle/incidents, calibrated from real rainfall.
2. `ml/eta_model` — train XGBoost on the calibrated synthetic set; wire up `pred_contribs` explanations.
3. `backend/propagation` + `backend/optimizer` — the CP-SAT model spanning rail + bus + EV constraints.
4. `backend/approval` + `backend/websocket` — the human-in-the-loop + two-channel sync.
5. `backend/api` + `backend/sim` — FastAPI app tying it together with a running clock.
6. `frontend-admin` — map, list, drill-down, injector.
7. `frontend-user` — itinerary planner, trip card.
