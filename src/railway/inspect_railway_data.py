from pathlib import Path
import json


PROJECT_ROOT = Path(__file__).resolve().parents[2]

RAILWAY_DIR = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "railway"
    / "reference"
    / "datameet_railways"
)


def load_json(filename):
    path = RAILWAY_DIR / filename

    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ============================================================
# STATIONS
# ============================================================

stations = load_json("stations.json")

print("=" * 70)
print("STATIONS")
print("=" * 70)

print("Top-level type:", type(stations).__name__)

if isinstance(stations, dict):
    print("Keys:", stations.keys())

    features = stations.get("features", [])
else:
    features = stations

print("Number of station records:", len(features))

if features:
    print("\nFirst station:")
    print(json.dumps(features[0], indent=2))


# ============================================================
# TRAINS
# ============================================================

trains = load_json("trains.json")

print("\n" + "=" * 70)
print("TRAINS")
print("=" * 70)

print("Top-level type:", type(trains).__name__)

if isinstance(trains, dict):
    print("Keys:", trains.keys())
    train_features = trains.get("features", [])
else:
    train_features = trains

print("Number of train records:", len(train_features))

if train_features:
    print("\nFirst train:")
    print(json.dumps(train_features[0], indent=2))


# ============================================================
# SCHEDULES
# ============================================================

schedules = load_json("schedules.json")

print("\n" + "=" * 70)
print("SCHEDULES")
print("=" * 70)

print("Top-level type:", type(schedules).__name__)

if isinstance(schedules, list):
    print("Number of schedule records:", len(schedules))

    if schedules:
        print("\nFirst schedule:")
        print(json.dumps(schedules[0], indent=2))

elif isinstance(schedules, dict):
    print("Keys:", schedules.keys())


print("\n" + "=" * 70)
print("✅ RAILWAY DATA INSPECTION COMPLETE")
print("=" * 70)