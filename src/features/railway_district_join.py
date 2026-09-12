from pathlib import Path
import geopandas as gpd
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[2]

ROUTES_PATH = (
    PROJECT_ROOT / "data" / "processed" / "railway"
    / "matched_train_routes.geojson"
)

DISTRICTS_PATH = (
    PROJECT_ROOT / "data" / "raw" / "geography"
    / "india_districts.geojson"
)

RISK_PATH = (
    PROJECT_ROOT / "data" / "processed" / "floods"
    / "district_flood_risk.csv"
)

OUTPUT_DIR = (
    PROJECT_ROOT / "data" / "processed" / "railway"
)

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ------------------------------------------------------------
# LOAD
# ------------------------------------------------------------

print("Loading railway routes...")
routes = gpd.read_file(ROUTES_PATH)

print("Loading district boundaries...")
districts = gpd.read_file(DISTRICTS_PATH)

print("Loading flood-risk table...")
risk = pd.read_csv(RISK_PATH)


# ------------------------------------------------------------
# CLEAN DISTRICT NAMES
# ------------------------------------------------------------

districts["district"] = (
    districts["NAME_2"]
    .astype(str)
    .str.strip()
)

risk["district_key"] = (
    risk["district"]
    .astype(str)
    .str.upper()
    .str.strip()
    .str.replace("*", "", regex=False)
)


def normalize(name):
    name = str(name).upper().strip()
    name = name.replace("*", "")
    name = " ".join(name.split())

    replacements = {
        "NORTH 24 PARGANAS": "NORTH TWENTY FOUR PARGANAS",
        "24 PARGANAS NORTH": "NORTH TWENTY FOUR PARGANAS",
        "SOUTH 24 PARGANAS": "SOUTH TWENTY FOUR PARGANAS",
        "24 PARGANAS SOUTH": "SOUTH TWENTY FOUR PARGANAS",
    }

    return replacements.get(name, name)


districts["district_key"] = districts["district"].apply(normalize)
risk["district_key"] = risk["district_key"].apply(normalize)


# ------------------------------------------------------------
# SAME CRS
# ------------------------------------------------------------

districts = districts.to_crs(routes.crs)


# ------------------------------------------------------------
# RAILWAY ROUTE → DISTRICT
# ------------------------------------------------------------

print("Joining railway routes with districts...")

joined = gpd.sjoin(
    routes[
        [
            "train_number",
            "train_name",
            "from_station_code",
            "from_station_name",
            "to_station_code",
            "to_station_name",
            "distance_km",
            "geometry",
        ]
    ],
    districts[
        [
            "district",
            "district_key",
            "geometry",
        ]
    ],
    how="left",
    predicate="intersects",
)


# ------------------------------------------------------------
# MERGE FLOOD RISK
# ------------------------------------------------------------

joined = joined.merge(
    risk[
        [
            "district_key",
            "dfsi",
            "historical_flood_events",
            "flood_proneness",
        ]
    ],
    on="district_key",
    how="left",
)


# ------------------------------------------------------------
# REMOVE DUPLICATE TRAIN-DISTRICT PAIRS
# ------------------------------------------------------------

joined = joined.drop_duplicates(
    subset=["train_number", "district_key"]
)


# ------------------------------------------------------------
# SAVE
# ------------------------------------------------------------

output_path = (
    OUTPUT_DIR / "train_district_flood_exposure.csv"
)

joined[
    [
        "train_number",
        "train_name",
        "from_station_name",
        "to_station_name",
        "distance_km",
        "district",
        "dfsi",
        "historical_flood_events",
        "flood_proneness",
    ]
].to_csv(output_path, index=False)


# ------------------------------------------------------------
# SUMMARY
# ------------------------------------------------------------

print("\n" + "=" * 70)
print("RAILWAY → DISTRICT JOIN")
print("=" * 70)

print("Train routes:", routes["train_number"].nunique())
print("Route-district pairs:", len(joined))
print(
    "Routes with a district:",
    joined["district"].notna().groupby(
        joined["train_number"]
    ).any().sum()
)

print("\nSample:")
print(
    joined[
        [
            "train_number",
            "district",
            "dfsi",
            "historical_flood_events",
        ]
    ]
    .head(20)
    .to_string(index=False)
)

print("\n✅ SAVED:")
print(output_path)