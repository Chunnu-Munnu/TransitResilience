from pathlib import Path
import pandas as pd
import geopandas as gpd


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


# ============================================================
# LOAD ROUTES
# ============================================================

routes = gpd.read_file(ROUTES_PATH)

print("=" * 70)
print("ROUTE GEOGRAPHY")
print("=" * 70)

print("CRS:", routes.crs)
print("Geometry types:")
print(routes.geometry.geom_type.value_counts())

print("\nRoute bounds:")
print(routes.total_bounds)

print("\nFirst route geometry:")
print(routes.geometry.iloc[0])


# ============================================================
# LOAD FLOODS
# ============================================================

flood = pd.read_csv(
    FLOOD_PATH,
    low_memory=False
)

flood["Latitude"] = pd.to_numeric(
    flood["Latitude"],
    errors="coerce"
)

flood["Longitude"] = pd.to_numeric(
    flood["Longitude"],
    errors="coerce"
)

flood = flood.dropna(
    subset=["Latitude", "Longitude"]
)

print("\n" + "=" * 70)
print("FLOOD GEOGRAPHY")
print("=" * 70)

print("Flood records:", len(flood))

print(
    "Latitude range:",
    flood["Latitude"].min(),
    "to",
    flood["Latitude"].max()
)

print(
    "Longitude range:",
    flood["Longitude"].min(),
    "to",
    flood["Longitude"].max()
)

print("\nSample coordinates:")
print(
    flood[
        ["Latitude", "Longitude"]
    ].head(10).to_string(index=False)
)


# ============================================================
# FLOOD POINT GEOMETRY
# ============================================================

flood_geo = gpd.GeoDataFrame(
    flood,
    geometry=gpd.points_from_xy(
        flood["Longitude"],
        flood["Latitude"]
    ),
    crs="EPSG:4326"
)

print("\nFlood CRS:", flood_geo.crs)

print(
    "Flood bounds:",
    flood_geo.total_bounds
)


# ============================================================
# PROJECT BOTH TO SAME CRS
# ============================================================

routes_metric = routes.to_crs(
    "EPSG:3857"
)

flood_metric = flood_geo.to_crs(
    "EPSG:3857"
)

print("\n" + "=" * 70)
print("AFTER CRS TRANSFORMATION")
print("=" * 70)

print("Route bounds:")
print(routes_metric.total_bounds)

print("\nFlood bounds:")
print(flood_metric.total_bounds)


# ============================================================
# INTERSECTION TEST
# ============================================================

print("\n" + "=" * 70)
print("OVERLAP TEST")
print("=" * 70)

route_union = routes_metric.geometry.union_all()

print(
    "Routes total length:",
    route_union.length
)

inside = flood_metric.geometry.within(
    route_union.buffer(100_000)
)

print(
    "Flood points within 100 km of ANY railway route:",
    int(inside.sum())
)

print(
    "Flood points outside 100 km:",
    int((~inside).sum())
)


# ============================================================
# NEAREST TEST ON ONE ROUTE
# ============================================================

print("\n" + "=" * 70)
print("SINGLE ROUTE TEST")
print("=" * 70)

first_route = routes_metric.geometry.iloc[0]

distances = flood_metric.geometry.distance(
    first_route
)

nearest_distance = distances.min()

print(
    "Nearest flood to first route:",
    nearest_distance / 1000,
    "km"
)