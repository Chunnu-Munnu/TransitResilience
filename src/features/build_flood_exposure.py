from pathlib import Path
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point


# ============================================================
# PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

ROUTES_PATH = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "railway"
    / "matched_train_routes.geojson"
)

FLOOD_PATH = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "floods"
    / "India_Flood_Inventory_v3.csv"
)

OUTPUT_DIR = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "floods"
)

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# LOAD RAILWAY ROUTES
# ============================================================

print("=" * 70)
print("LOADING RAILWAY ROUTES")
print("=" * 70)

routes = gpd.read_file(ROUTES_PATH)

print("Routes:", len(routes))
print("CRS:", routes.crs)


# ============================================================
# LOAD HISTORICAL FLOODS
# ============================================================

print("\n" + "=" * 70)
print("LOADING HISTORICAL FLOODS")
print("=" * 70)

flood = pd.read_csv(
    FLOOD_PATH,
    low_memory=False
)

print("Flood records:", len(flood))


# ============================================================
# CLEAN FLOOD COORDINATES
# ============================================================

flood["Latitude"] = pd.to_numeric(
    flood["Latitude"],
    errors="coerce"
)

flood["Longitude"] = pd.to_numeric(
    flood["Longitude"],
    errors="coerce"
)

flood_geo = flood.dropna(
    subset=["Latitude", "Longitude"]
).copy()

print(
    "Flood records with coordinates:",
    len(flood_geo)
)


# ============================================================
# CREATE FLOOD POINTS
# ============================================================

flood_points = gpd.GeoDataFrame(
    flood_geo,
    geometry=[
        Point(lon, lat)
        for lon, lat
        in zip(
            flood_geo["Longitude"],
            flood_geo["Latitude"]
        )
    ],
    crs="EPSG:4326"
)


# ============================================================
# PROJECT TO METRIC CRS
# ============================================================
#
# EPSG:3857 is used here for a practical hackathon-level
# distance calculation in metres.
#
# We will NOT present these distances as survey-grade
# measurements.
# ============================================================

routes_metric = routes.to_crs(
    "EPSG:3857"
)

flood_metric = flood_points.to_crs(
    "EPSG:3857"
)


# ============================================================
# FIND NEAREST HISTORICAL FLOOD
# ============================================================

print("\nFinding nearest historical flood to each route...")

nearest = gpd.sjoin_nearest(
    routes_metric,
    flood_metric[
        [
            "UEI",
            "Severity",
            "Area Affected",
            "Start Date",
            "geometry"
        ]
    ],
    how="left",
    distance_col="nearest_flood_distance_m"
)


# ============================================================
# FLOOD EVENTS WITHIN 25 KM
# ============================================================

print("Calculating flood events within 25 km...")

radius_25km = 25_000

# Spatial join using route buffer
route_buffers = routes_metric.copy()

route_buffers["geometry"] = (
    route_buffers.geometry.buffer(
        radius_25km
    )
)

events_25km = gpd.sjoin(
    flood_metric[
        [
            "UEI",
            "Severity",
            "geometry"
        ]
    ],
    route_buffers[
        [
            "train_number",
            "geometry"
        ]
    ],
    how="inner",
    predicate="within"
)


# One historical flood event counts once per train
events_25km_unique = (
    events_25km[
        [
            "train_number",
            "UEI"
        ]
    ]
    .drop_duplicates()
)


flood_count_25km = (
    events_25km_unique
    .groupby("train_number")
    .size()
    .reset_index(
        name="historical_flood_events_25km"
    )
)


# ============================================================
# FLOOD EVENTS WITHIN 50 KM
# ============================================================

print("Calculating flood events within 50 km...")

radius_50km = 50_000

route_buffers_50 = routes_metric.copy()

route_buffers_50["geometry"] = (
    route_buffers_50.geometry.buffer(
        radius_50km
    )
)

events_50km = gpd.sjoin(
    flood_metric[
        [
            "UEI",
            "Severity",
            "geometry"
        ]
    ],
    route_buffers_50[
        [
            "train_number",
            "geometry"
        ]
    ],
    how="inner",
    predicate="within"
)

events_50km_unique = (
    events_50km[
        [
            "train_number",
            "UEI"
        ]
    ]
    .drop_duplicates()
)

flood_count_50km = (
    events_50km_unique
    .groupby("train_number")
    .size()
    .reset_index(
        name="historical_flood_events_50km"
    )
)


# ============================================================
# MERGE FEATURES
# ============================================================

result = nearest.copy()

result["nearest_flood_distance_km"] = (
    result["nearest_flood_distance_m"]
    / 1000
)


result = result.merge(
    flood_count_25km,
    on="train_number",
    how="left"
)

result = result.merge(
    flood_count_50km,
    on="train_number",
    how="left"
)


# ============================================================
# FILL NO-EVENT CASES
# ============================================================

result[
    "historical_flood_events_25km"
] = (
    result[
        "historical_flood_events_25km"
    ]
    .fillna(0)
    .astype(int)
)

result[
    "historical_flood_events_50km"
] = (
    result[
        "historical_flood_events_50km"
    ]
    .fillna(0)
    .astype(int)
)


# ============================================================
# SELECT FINAL COLUMNS
# ============================================================

final_columns = [
    "train_number",
    "train_name",
    "from_station_code",
    "from_station_name",
    "to_station_code",
    "to_station_name",
    "distance_km",
    "nearest_flood_distance_km",
    "historical_flood_events_25km",
    "historical_flood_events_50km",
    "Severity"
]

result = result[
    [
        column
        for column in final_columns
        if column in result.columns
    ]
].copy()


# ============================================================
# REMOVE DUPLICATES
# ============================================================

result = result.drop_duplicates(
    subset=["train_number"]
)


# ============================================================
# SAVE
# ============================================================

output_path = (
    OUTPUT_DIR
    / "railway_flood_exposure.csv"
)

result.to_csv(
    output_path,
    index=False
)


# ============================================================
# DISPLAY
# ============================================================

print("\n" + "=" * 70)
print("RAILWAY FLOOD EXPOSURE")
print("=" * 70)

print(
    result[
        [
            "train_number",
            "nearest_flood_distance_km",
            "historical_flood_events_25km",
            "historical_flood_events_50km"
        ]
    ]
    .sort_values(
        "historical_flood_events_25km",
        ascending=False
    )
    .head(20)
    .to_string(index=False)
)


print("\n" + "=" * 70)
print("✅ FLOOD EXPOSURE COMPLETE")
print("=" * 70)

print("Saved to:")
print(output_path)