# Dataset Sources

Status as of 2026-09-12: which of these are real downloaded data, which are legitimate substitutes, and which are still missing.

## 1. Indian Railways Train Delay Dataset — ⚠️ STILL MISSING
File:
`ir_train.csv`

Purpose:
Historical train delay / ETA modeling — would let us calibrate the ETA model against real delay-vs-condition patterns.

Local path (not yet present):
`data/raw/railway/ir_train.csv`

Status:
No freely-downloadable version found. The candidates that exist (e.g. Kaggle's "Indian Railways Train Delays Dataset 2025", "Indian Railway Delay Dataset") require a Kaggle account + API token to fetch — an agent can't authenticate as you. Also note: none of the Kaggle options are Mumbai-suburban-EMU-specific; they cover mainline express trains. Two paths forward: (a) you download one manually from Kaggle and drop it in the path above, or (b) we skip a real per-train delay dataset entirely and calibrate the synthetic ETA/delay-generation formula against the *real* rainfall-severity relationship we do have (see #2) plus IMD's official rainfall-intensity categories — defensible, and arguably fine since the trains themselves are synthetic anyway.

---

## 2. Rainfall — ✅ REPLACED WITH A REAL, DOWNLOADED SUBSTITUTE
Originally specified:
`RF25_ind2025_rfp25.nc` (IMD 0.25° gridded rainfall — requires IMD Pune registration, not freely downloadable)

What we actually have now:
`data/raw/rainfall/mumbai_daily_rainfall_2015_2024_NASA_POWER.csv`

Source:
NASA POWER API (`power.larc.nasa.gov`), MERRA-2 reanalysis, `PRECTOTCORR` (corrected precipitation, mm/day), no auth required, freely re-downloadable with a plain HTTP request. Coordinates used: 19.07°N, 72.88°E (Kurla, on the corridor).

Coverage:
10 years, 01-Jan-2015 to 31-Dec-2024, daily.

Caveat to know and be able to explain to a judge:
MERRA-2/POWER is a coarse (~50km grid) satellite/model reanalysis product, not a ground rain-gauge reading — it smooths out short, intense convective bursts. It will understate Mumbai's most extreme cloudburst days (e.g. the 26 July 2005 event, ~944mm/day at the Colaba gauge, would not show up at this magnitude here). It is a legitimate, real, and commonly-used substitute for grounding *typical* monsoon rainfall distribution and IMD-style intensity thresholds — not for claiming we've reproduced the single most extreme historical event.

Real numbers already computed from this file (usable directly in the pitch/demo calibration):
- Monsoon-season (Jun–Sep) daily rainfall percentiles: p50 = 11.9mm, p75 = 28.4mm, p90 = 57.7mm, p95 = 76.0mm, p99 = 117.9mm, max = 143.9mm.
- Using IMD's official 24hr rainfall-intensity bands, frequency over the 10-year monsoon record: Heavy (64.5–115.5mm) ≈ 7.9 days/year · Very Heavy (115.6–204.4mm) ≈ 1.3 days/year · Extremely Heavy (≥204.5mm) ≈ 0 days/year in this dataset (see caveat above on why).
- **Suggested demo threshold:** flood-risk scoring should start climbing meaningfully once rainfall crosses the *Heavy* band (~64.5mm/hr in the pitch's framing, or the daily equivalent above) — that's the point where real historical frequency data says disruption becomes a several-times-a-season event, not a rare one.

---

## 3. India Flood Inventory v3 — ✅ DOWNLOADED, REAL DATA
File:
`India_Flood_Inventory_v3.csv`

Local path:
`data/raw/floods/India_Flood_Inventory_v3.csv`

Source:
`hydrosenselab/India-Flood-Inventory` (GitHub), the official repo for the IFI v3.0 dataset (IMD-collaborated, 1967–2023).

Real numbers already computed from this file:
- 6,876 total recorded flood events nationally.
- 1,030 event records mention Maharashtra; 267 mention Mumbai specifically — solid grounding for "this is a real, recurring, high-frequency disruption type on this corridor," not a hackathon-invented hazard.

---

## 4. District Flood Severity Index — ✅ DOWNLOADED, REAL DATA
File:
`DFSI.csv`

Local path:
`data/raw/floods/DFSI.csv`

Source:
`msaharia/India-flood-inventory-impacts` (GitHub) — companion repo to IFI, publishes the District Flood Severity Index (accounts for historical people-affected, spread, and duration of floods per district).

---

## 5. Railway Geographic Reference — ✅ BUILT FROM REAL DATA
File:
`mumbai_central_line_stations.csv`

Local path:
`data/raw/railway/mumbai_central_line_stations.csv`

Source:
Station codes and coordinates extracted from `datameet/railways` (`stations.json`) — a long-running open dataset of official Indian Railways station codes/locations.

Contents:
14 real stations, Mumbai CST → Kalyan Jn, in real order with real lat/lon — this is the actual Central Line corridor used for the demo. The `known_monsoon_risk` column is a qualitative tag we assigned from general, well-documented public reporting on Mumbai's recurring waterlogging hotspots (Kurla, Dadar, and the Thane–Mumbra–Diva stretch) — flag this as our own annotation, not a sourced dataset field, if asked.

---

## 6. India District Boundaries — ✅ AVAILABLE IF NEEDED (not yet copied in)
Found in:
`datameet/maps` (`Districts/Census_2011/2011_Dist.shp` — shapefile, not GeoJSON, but the same official 2011-census boundaries).

Note:
Given the demo works off precise per-station coordinates (see #5), city/district-level polygons add little — pull this in only if a future feature genuinely needs district-level spatial joins.

---

### Note

Raw datasets are intentionally excluded from GitHub (`data/raw/` is gitignored). Anything listed above as "downloaded" is sitting locally in this repo right now, not committed.