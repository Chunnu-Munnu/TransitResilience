"""
Generates the entire synthetic world the demo runs on:
  - the rail corridor (from the real station data)
  - 10-12 synthetic train services with a timetable
  - a parallel road/traffic layer (Section 4.2 of the master spec)
  - a bus/EV fleet + charging stations (Section 4.3)
  - one autonomous last-mile shuttle with two candidate paths (Section 4.4)
  - a rainfall calibration derived from the REAL NASA POWER data already downloaded (Section 4.6)

Run: python data/generate_synthetic_world.py
Output: data/synthetic/*.json
"""
import csv
import json
import math
import random
from pathlib import Path

random.seed(42)

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
OUT = ROOT / "synthetic"
OUT.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# 1. Corridor — load the real station data
# ---------------------------------------------------------------------------
def load_corridor():
    stations = []
    with open(RAW / "railway" / "mumbai_central_line_stations.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            order = int(row["order"])
            stations.append({
                "order": order,
                "code": row["code"],
                "name": row["name"],
                "lat": float(row["latitude"]),
                "lon": float(row["longitude"]),
                "monsoon_risk": row["known_monsoon_risk"],
                # Platform count + the platform a diverted service would be held on,
                # and how far the street-level bus bay is from that platform.
                # Synthetic but stable per station, so passenger instructions never
                # change between refreshes.
                "platforms": 4 if order in (1, 4, 10, 14) else 2,
                "diversion_platform": (order % 4) + 1,
                "bus_bay_walk_m": 120 + (order * 25) % 260,
            })
    stations.sort(key=lambda s: s["order"])

    segments = []
    for a, b in zip(stations, stations[1:]):
        dist_km = haversine_km(a["lat"], a["lon"], b["lat"], b["lon"])
        segments.append({
            "id": f"{a['code']}_{b['code']}",
            "from": a["code"],
            "to": b["code"],
            "distance_km": round(dist_km, 2),
            # base risk seed: "high" tagged stations bias the segment touching them
            "base_risk": 0.15 if "high" in (a["monsoon_risk"], b["monsoon_risk"]) else
                         0.08 if "medium" in (a["monsoon_risk"], b["monsoon_risk"]) else 0.03,
        })
    return stations, segments


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# 2. Rainfall calibration — REAL data, not invented
# ---------------------------------------------------------------------------
def load_rainfall_calibration():
    path = RAW / "rainfall" / "mumbai_daily_rainfall_2015_2024_NASA_POWER.csv"
    values = []
    monsoon_values = []
    with open(path, encoding="utf-8") as f:
        started = False
        for line in f:
            if line.startswith("YEAR"):
                started = True
                continue
            if not started:
                continue
            parts = line.strip().split(",")
            if len(parts) != 3:
                continue
            year, doy, val = parts
            try:
                val = float(val)
            except ValueError:
                continue
            if val < 0:
                continue
            values.append(val)
            # rough month-of-year from day-of-year to flag monsoon (Jun-Sep, doy ~152-273)
            doy_i = int(doy)
            if 152 <= doy_i <= 273:
                monsoon_values.append(val)

    def pct(arr, p):
        s = sorted(arr)
        idx = min(int(p / 100 * len(s)), len(s) - 1)
        return s[idx]

    calibration = {
        "source": "NASA POWER MERRA-2, real daily data, 2015-2024, Kurla coordinates (19.07N 72.88E)",
        "monsoon_days_sampled": len(monsoon_values),
        "monsoon_p50_mm": round(pct(monsoon_values, 50), 2),
        "monsoon_p75_mm": round(pct(monsoon_values, 75), 2),
        "monsoon_p90_mm": round(pct(monsoon_values, 90), 2),
        "monsoon_p95_mm": round(pct(monsoon_values, 95), 2),
        "monsoon_p99_mm": round(pct(monsoon_values, 99), 2),
        "imd_bands_mm_per_24h": {
            "moderate": [15, 64.5],
            "heavy": [64.5, 115.6],
            "very_heavy": [115.6, 204.5],
            "extremely_heavy": [204.5, 999],
        },
        # this is the number the live demo's anomaly slider is calibrated against
        "disruption_threshold_mm": 64.5,
    }
    return calibration


# ---------------------------------------------------------------------------
# 3. Trains — 12 synthetic services on the real corridor
# ---------------------------------------------------------------------------
def generate_trains(stations, n=12):
    trains = []
    start_minutes = 6 * 60  # 06:00
    headway = 12  # minutes between departures
    for i in range(n):
        dep = start_minutes + i * headway
        service_type = "fast" if i % 3 == 0 else "slow"
        trains.append({
            "id": f"T{101 + i}",
            "service_type": service_type,
            "departure_station": stations[0]["code"],
            "terminus_station": stations[-1]["code"],
            "scheduled_departure_min": dep,
            "current_segment_index": 0,   # index into corridor segments; sim advances this
            "progress_in_segment": 0.0,   # 0..1 fraction along current segment
            "delay_min": 0,
            "status": "on_time",
        })
    return trains


# ---------------------------------------------------------------------------
# 4. Road / traffic layer (answers "traffic management")
# ---------------------------------------------------------------------------
def generate_road_layer(segments):
    # Only the historically flood/congestion-prone segments get a shadow road
    roads = []
    for seg in segments:
        if seg["base_risk"] >= 0.08:
            roads.append({
                "id": f"ROAD_{seg['id']}",
                "shadows_segment": seg["id"],
                "name": f"Road alt. for {seg['from']}-{seg['to']}",
                "congestion_index": round(random.uniform(0.1, 0.3), 2),
            })
    return roads


# ---------------------------------------------------------------------------
# 5. Bus/EV fleet + charging stations (answers "fleet operations" + "EV ecosystem")
# ---------------------------------------------------------------------------
def generate_fleet(stations):
    depots = [stations[3], stations[7], stations[11]]  # Kurla, Nahur, Dombivli-ish spread
    buses = []
    for i in range(6):
        depot = depots[i % len(depots)]
        buses.append({
            "id": f"BUS_{i+1:02d}",
            "type": "EV" if i % 2 == 0 else "diesel",
            "depot_code": depot["code"],
            "capacity": 45,
            "current_load": 0,
            "assigned_route": None,
            "driver_on_shift": True,
        })

    chargers = []
    for i, depot in enumerate(depots):
        chargers.append({
            "id": f"CHG_{i+1:02d}",
            "station_code": depot["code"],
            "bays": 4,
            "occupied_bays": random.randint(0, 2),
            "charge_rate_kw": 60,
        })
    return buses, chargers


# ---------------------------------------------------------------------------
# 6. Autonomous last-mile shuttle (answers "autonomous mobility")
# ---------------------------------------------------------------------------
def generate_shuttle(stations):
    anchor = stations[3]  # Kurla Jn — a high-risk, high-footfall station
    return {
        "id": "AV_SHUTTLE_1",
        "anchor_station": anchor["code"],
        "primary_path": {"name": "Kurla station -> LBS Marg loop", "risk_source_segment": "CLA_GC"},
        "secondary_path": {"name": "Kurla station -> Tilak Nagar bypass", "risk_source_segment": None},
        "active_path": "primary",
        "reroute_threshold": 0.5,
    }


# ---------------------------------------------------------------------------
# 7. Incident templates (answers the news/crowd-report sensing module)
# ---------------------------------------------------------------------------
def generate_incident_templates():
    return [
        {"template": "Scuffle reported at {station} station, platform access briefly restricted", "type": "incident", "default_severity": 0.4},
        {"template": "Signal failure near {station}, services running cautiously", "type": "maintenance", "default_severity": 0.5},
        {"template": "Waterlogging reported on approach to {station}", "type": "flood", "default_severity": 0.7},
        {"template": "Minor fire reported near {station} yard, under control", "type": "incident", "default_severity": 0.6},
        {"template": "Heavy congestion reported on road parallel to {station}-{next_station}", "type": "traffic", "default_severity": 0.3},
    ]


# ---------------------------------------------------------------------------
def main():
    stations, segments = load_corridor()
    rainfall = load_rainfall_calibration()
    trains = generate_trains(stations, n=12)
    roads = generate_road_layer(segments)
    buses, chargers = generate_fleet(stations)
    shuttle = generate_shuttle(stations)
    incident_templates = generate_incident_templates()

    corridor = {"stations": stations, "segments": segments}

    (OUT / "corridor.json").write_text(json.dumps(corridor, indent=2))
    (OUT / "trains.json").write_text(json.dumps(trains, indent=2))
    (OUT / "rainfall_calibration.json").write_text(json.dumps(rainfall, indent=2))
    (OUT / "roads.json").write_text(json.dumps(roads, indent=2))
    (OUT / "fleet.json").write_text(json.dumps({"buses": buses, "chargers": chargers}, indent=2))
    (OUT / "shuttle.json").write_text(json.dumps(shuttle, indent=2))
    (OUT / "incident_templates.json").write_text(json.dumps(incident_templates, indent=2))

    print(f"Stations: {len(stations)}  Segments: {len(segments)}  Trains: {len(trains)}")
    print(f"Roads: {len(roads)}  Buses: {len(buses)}  Chargers: {len(chargers)}")
    print(f"Disruption rainfall threshold (real, calibrated): {rainfall['disruption_threshold_mm']}mm")
    print("Written to data/synthetic/")


if __name__ == "__main__":
    main()
