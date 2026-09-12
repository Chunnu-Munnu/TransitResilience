from pathlib import Path
import json
import pandas as pd


# ============================================================
# PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

TRAIN_DATA_PATH = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "railway"
    / "ir_train.csv"
)

REFERENCE_DIR = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "railway"
    / "reference"
    / "datameet_railways"
)

TRAINS_PATH = REFERENCE_DIR / "trains.json"
SCHEDULES_PATH = REFERENCE_DIR / "schedules.json"
STATIONS_PATH = REFERENCE_DIR / "stations.json"


# ============================================================
# NORMALIZATION
# ============================================================

def normalize_train_number(value):
    """
    Convert train numbers to a consistent string form.

    Examples:
        12536 -> "12536"
        "12536" -> "12536"
        "012536" -> "12536"
    """
    if pd.isna(value):
        return None

    value = str(value).strip()

    # Remove accidental decimal representation
    if value.endswith(".0"):
        value = value[:-2]

    # Keep only digits when possible
    if value.isdigit():
        return str(int(value))

    return value


def normalize_station_code(value):
    if pd.isna(value):
        return None

    return str(value).strip().upper()


# ============================================================
# LOAD TRAIN ETA DATA
# ============================================================

print("=" * 70)
print("LOADING TRAIN ETA DATA")
print("=" * 70)

train = pd.read_csv(
    TRAIN_DATA_PATH,
    low_memory=False
)

print("Rows:", f"{len(train):,}")
print("Columns:", len(train.columns))

train["train_number_clean"] = (
    train["train_number"]
    .apply(normalize_train_number)
)

eta_train_numbers = set(
    train["train_number_clean"]
    .dropna()
    .unique()
)

print(
    "Unique train numbers in ETA dataset:",
    f"{len(eta_train_numbers):,}"
)


# ============================================================
# LOAD GEOGRAPHIC TRAIN DATA
# ============================================================

print("\n" + "=" * 70)
print("LOADING GEOGRAPHIC TRAIN DATA")
print("=" * 70)

with open(
    TRAINS_PATH,
    "r",
    encoding="utf-8"
) as f:
    trains_data = json.load(f)


if isinstance(trains_data, dict):
    train_features = trains_data.get(
        "features",
        []
    )
else:
    train_features = trains_data


train_geo_rows = []

for feature in train_features:

    properties = feature.get(
        "properties",
        {}
    )

    train_number = normalize_train_number(
        properties.get("number")
    )

    train_geo_rows.append(
        {
            "train_number_clean": train_number,
            "train_name": properties.get("name"),
            "from_station_code": normalize_station_code(
                properties.get("from_station_code")
            ),
            "from_station_name": properties.get(
                "from_station_name"
            ),
            "to_station_code": normalize_station_code(
                properties.get("to_station_code")
            ),
            "to_station_name": properties.get(
                "to_station_name"
            ),
            "distance_km": properties.get(
                "distance"
            ),
            "duration_hours": properties.get(
                "duration_h"
            ),
            "duration_minutes": properties.get(
                "duration_m"
            ),
            "geometry": feature.get(
                "geometry"
            )
        }
    )


train_geo = pd.DataFrame(
    train_geo_rows
)

train_geo = train_geo.dropna(
    subset=["train_number_clean"]
)

print(
    "Geographic train records:",
    f"{len(train_geo):,}"
)

print(
    "Unique geographic train numbers:",
    f"{train_geo['train_number_clean'].nunique():,}"
)


# ============================================================
# MATCH TRAIN NUMBERS
# ============================================================

geo_train_numbers = set(
    train_geo[
        "train_number_clean"
    ].unique()
)

matched = (
    eta_train_numbers
    &
    geo_train_numbers
)

unmatched = (
    eta_train_numbers
    -
    geo_train_numbers
)


print("\n" + "=" * 70)
print("TRAIN NUMBER MATCHING")
print("=" * 70)

print(
    "ETA dataset train numbers:",
    f"{len(eta_train_numbers):,}"
)

print(
    "Geographic train numbers:",
    f"{len(geo_train_numbers):,}"
)

print(
    "Matched train numbers:",
    f"{len(matched):,}"
)

print(
    "Unmatched train numbers:",
    f"{len(unmatched):,}"
)

if len(eta_train_numbers) > 0:

    match_percentage = (
        len(matched)
        /
        len(eta_train_numbers)
        *
        100
    )

    print(
        "Match percentage:",
        f"{match_percentage:.2f}%"
    )


# ============================================================
# SAVE MATCHED TRAIN ROUTES
# ============================================================

matched_routes = train_geo[
    train_geo["train_number_clean"].isin(matched)
].copy()

output_dir = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "railway"
)

output_dir.mkdir(
    parents=True,
    exist_ok=True
)

output_path = (
    output_dir
    / "matched_train_routes.csv"
)

# Don't put full GeoJSON geometry into CSV yet.
matched_routes_csv = matched_routes.drop(
    columns=["geometry"]
)

matched_routes_csv.to_csv(
    output_path,
    index=False
)


# ============================================================
# DISPLAY EXAMPLES
# ============================================================

print("\n" + "=" * 70)
print("SAMPLE MATCHED TRAINS")
print("=" * 70)

print(
    matched_routes_csv[
        [
            "train_number_clean",
            "train_name",
            "from_station_code",
            "from_station_name",
            "to_station_code",
            "to_station_name",
            "distance_km"
        ]
    ]
    .head(20)
    .to_string(index=False)
)


print("\n" + "=" * 70)
print("✅ ROUTE MATCHING COMPLETE")
print("=" * 70)

print("Saved:")
print(output_path)