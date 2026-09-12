from pathlib import Path
import json
import pandas as pd
import geopandas as gpd
from shapely.geometry import LineString


# ============================================================
# PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

TRAINS_PATH = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "railway"
    / "reference"
    / "datameet_railways"
    / "trains.json"
)

MATCHED_PATH = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "railway"
    / "matched_train_routes.csv"
)

OUTPUT_DIR = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "railway"
)

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# NORMALIZE TRAIN NUMBER
# ============================================================

def normalize_train_number(value):

    if pd.isna(value):
        return None

    value = str(value).strip()

    if value.endswith(".0"):
        value = value[:-2]

    if value.isdigit():
        return str(int(value))

    return value


# ============================================================
# LOAD MATCHED TRAINS
# ============================================================

print("=" * 70)
print("LOADING MATCHED TRAIN NUMBERS")
print("=" * 70)

matched = pd.read_csv(
    MATCHED_PATH,
    low_memory=False
)

matched["train_number_clean"] = (
    matched["train_number_clean"]
    .apply(normalize_train_number)
)

matched_numbers = set(
    matched["train_number_clean"]
    .dropna()
)

print(
    "Matched train numbers:",
    f"{len(matched_numbers):,}"
)


# ============================================================
# LOAD DATAMEET TRAIN GEOMETRY
# ============================================================

print("\nLoading train geometries...")

with open(
    TRAINS_PATH,
    "r",
    encoding="utf-8"
) as f:
    trains_data = json.load(f)

features = (
    trains_data.get("features", [])
    if isinstance(trains_data, dict)
    else trains_data
)


# ============================================================
# BUILD GEOMETRIES
# ============================================================

records = []

for feature in features:

    properties = feature.get(
        "properties",
        {}
    )

    train_number = normalize_train_number(
        properties.get("number")
    )

    if train_number not in matched_numbers:
        continue

    geometry = feature.get(
        "geometry"
    )

    if not geometry:
        continue

    if geometry.get("type") != "LineString":
        continue

    coordinates = geometry.get(
        "coordinates",
        []
    )

    if len(coordinates) < 2:
        continue

    try:

        line = LineString(
            coordinates
        )

        records.append(
            {
                "train_number": train_number,
                "train_name": properties.get("name"),
                "from_station_code": properties.get(
                    "from_station_code"
                ),
                "from_station_name": properties.get(
                    "from_station_name"
                ),
                "to_station_code": properties.get(
                    "to_station_code"
                ),
                "to_station_name": properties.get(
                    "to_station_name"
                ),
                "distance_km": properties.get(
                    "distance"
                ),
                "geometry": line
            }
        )

    except Exception as e:
        print(
            f"Skipping train {train_number}: {e}"
        )


# ============================================================
# CREATE GEODATAFRAME
# ============================================================

gdf = gpd.GeoDataFrame(
    records,
    geometry="geometry",
    crs="EPSG:4326"
)


# ============================================================
# REMOVE DUPLICATES
# ============================================================

gdf = gdf.drop_duplicates(
    subset=["train_number"]
)


# ============================================================
# SAVE GEOJSON
# ============================================================

output_path = (
    OUTPUT_DIR
    / "matched_train_routes.geojson"
)

gdf.to_file(
    output_path,
    driver="GeoJSON"
)


# ============================================================
# SUMMARY
# ============================================================

print("\n" + "=" * 70)
print("ROUTE GEODATA COMPLETE")
print("=" * 70)

print(
    "Routes created:",
    f"{len(gdf):,}"
)

print(
    "Output:",
    output_path
)

print("\nSample routes:")

print(
    gdf[
        [
            "train_number",
            "train_name",
            "from_station_name",
            "to_station_name",
            "distance_km"
        ]
    ]
    .head(10)
    .to_string(index=False)
)

print(
    "\n✅ Railway routes are now stored as geographic LineStrings."
)