from pathlib import Path
import geopandas as gpd

PROJECT_ROOT = Path(__file__).resolve().parents[2]

DISTRICT_PATH = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "geography"
    / "india_districts.geojson"
)

print("=" * 70)
print("LOADING DISTRICT BOUNDARIES")
print("=" * 70)

districts = gpd.read_file(DISTRICT_PATH)

print("Number of districts/features:", len(districts))
print("CRS:", districts.crs)

print("\nColumns:")
print(districts.columns.tolist())

print("\nGeometry types:")
print(districts.geometry.geom_type.value_counts())

print("\nFirst 5 rows:")
print(
    districts.head().to_string()
)

print("\nBounds:")
print(districts.total_bounds)

print("\nMissing values:")
print(
    districts.isnull().sum()
    .sort_values(ascending=False)
    .head(15)
)

print("\n✅ DISTRICT DATA INSPECTION COMPLETE")