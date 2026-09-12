from pathlib import Path
import pandas as pd
import xarray as xr


# ============================================================
# PATHS
# ============================================================

# Project root = TransitResilience/
PROJECT_ROOT = Path(__file__).resolve().parents[2]

TRAIN_PATH = PROJECT_ROOT / "data" / "raw" / "railway" / "ir_train.csv"
RAINFALL_PATH = PROJECT_ROOT / "data" / "raw" / "rainfall" / "RF25_ind2025_rfp25.nc"
DFSI_PATH = PROJECT_ROOT / "data" / "raw" / "floods" / "DFSI.csv"
FLOOD_PATH = PROJECT_ROOT / "data" / "raw" / "floods" / "India_Flood_Inventory_v3.csv"


# ============================================================
# HELPERS
# ============================================================

def print_section(title: str) -> None:
    print("\n" + "=" * 70)
    print(title)
    print("=" * 70)


# ============================================================
# 1. DFSI DATA
# ============================================================

print_section("1. DISTRICT FLOOD SEVERITY INDEX (DFSI)")

dfsi = pd.read_csv(DFSI_PATH)

print(f"Rows: {len(dfsi):,}")
print(f"Columns: {len(dfsi.columns)}")
print(f"Columns: {dfsi.columns.tolist()}")

print("\nFirst 5 rows:")
print(dfsi.head())

print("\nMissing values:")
print(dfsi.isnull().sum())

if "DFSI" in dfsi.columns:
    print("\nDFSI statistics:")
    print(dfsi["DFSI"].describe())

print("\nTop 10 most flood-severe districts:")
print(
    dfsi[["State_Name", "DFSI"]]
    .sort_values("DFSI", ascending=False)
    .head(10)
)


# ============================================================
# 2. HISTORICAL FLOOD EVENTS
# ============================================================

print_section("2. HISTORICAL FLOOD INVENTORY")

flood = pd.read_csv(FLOOD_PATH, low_memory=False)

print(f"Rows: {len(flood):,}")
print(f"Columns: {len(flood.columns)}")
print(f"Columns:\n{flood.columns.tolist()}")

print("\nFirst 5 rows:")
print(flood.head())

print("\nMissing values:")
print(flood.isnull().sum())

# Convert dates if present
if "Start Date" in flood.columns:
    flood["Start Date"] = pd.to_datetime(
        flood["Start Date"],
        errors="coerce"
    )

if "End Date" in flood.columns:
    flood["End Date"] = pd.to_datetime(
        flood["End Date"],
        errors="coerce"
    )

if "Start Date" in flood.columns:
    print("\nFlood event date range:")
    print("Start:", flood["Start Date"].min())
    print("End:", flood["Start Date"].max())

if "Severity" in flood.columns:
    print("\nFlood severity distribution:")
    print(flood["Severity"].value_counts(dropna=False))

if "State" in flood.columns:
    print("\nTop 10 states by flood-event count:")
    print(flood["State"].value_counts().head(10))


# ============================================================
# 3. TRAIN / ETA DATA
# ============================================================

print_section("3. TRAIN DELAY / ETA DATA")

# Read the full dataset
train = pd.read_csv(TRAIN_PATH, low_memory=False)

print(f"Rows: {len(train):,}")
print(f"Columns: {len(train.columns)}")
print(f"Columns:\n{train.columns.tolist()}")

print("\nFirst 5 rows:")
print(train.head())

print("\nMissing values:")
missing_train = train.isnull().sum().sort_values(ascending=False)
print(missing_train[missing_train > 0])

# Parse departure date
if "departure_date" in train.columns:
    train["departure_date"] = pd.to_datetime(
        train["departure_date"],
        errors="coerce"
    )

    print("\nTrain date range:")
    print("Start:", train["departure_date"].min())
    print("End:", train["departure_date"].max())

# Delay statistics
if "delay_minutes" in train.columns:
    print("\nDelay statistics:")
    print(train["delay_minutes"].describe())

if "is_delayed" in train.columns:
    print("\nDelayed vs on-time:")
    print(train["is_delayed"].value_counts(dropna=False))

# Flood-related delay records
if "primary_delay_cause" in train.columns:
    print("\nDelay causes:")
    print(train["primary_delay_cause"].value_counts(dropna=False))

    flood_delay_mask = (
        train["primary_delay_cause"]
        .astype(str)
        .str.contains(
            "Flooding|Waterlogging",
            case=False,
            na=False
        )
    )

    flood_delay_count = flood_delay_mask.sum()

    print(
        f"\nRecords with flood/waterlogging as primary delay cause: "
        f"{flood_delay_count:,}"
    )

    if flood_delay_count > 0 and "delay_minutes" in train.columns:
        print("\nFlood/waterlogging delay statistics:")
        print(
            train.loc[flood_delay_mask, "delay_minutes"].describe()
        )


# ============================================================
# 4. RAINFALL DATA
# ============================================================

print_section("4. IMD RAINFALL DATA")

rain = xr.open_dataset(
    RAINFALL_PATH,
    engine="netcdf4"
)

print("Dataset:")
print(rain)

print("\nDimensions:")
print(rain.sizes)

print("\nVariables:")
print(list(rain.data_vars))

print("\nCoordinates:")
print(list(rain.coords))

rainfall = rain["RAINFALL"]

print("\nRainfall attributes:")
print(rainfall.attrs)

print("\nRainfall date range:")
print(
    rain["TIME"].values[0],
    "to",
    rain["TIME"].values[-1]
)

print("\nRainfall grid:")
print(
    "Latitude:",
    float(rain["LATITUDE"].min()),
    "to",
    float(rain["LATITUDE"].max())
)

print(
    "Longitude:",
    float(rain["LONGITUDE"].min()),
    "to",
    float(rain["LONGITUDE"].max())
)

# Basic rainfall statistics
print("\nRainfall statistics:")

rain_min = float(rainfall.min(skipna=True).values)
rain_max = float(rainfall.max(skipna=True).values)
rain_mean = float(rainfall.mean(skipna=True).values)

print("Minimum:", rain_min, "mm")
print("Maximum:", rain_max, "mm")
print("Mean:", rain_mean, "mm")

# Missing percentage
total_values = rainfall.size
missing_values = int(rainfall.isnull().sum().values)

print("\nRainfall missing values:")
print(f"{missing_values:,} / {total_values:,}")

if total_values > 0:
    print(
        "Missing percentage:",
        round((missing_values / total_values) * 100, 4),
        "%"
    )


# ============================================================
# 5. PROJECT DATA SUMMARY
# ============================================================

print_section("5. PROJECT DATA SUMMARY")

print("""
We currently have:

1. TRAIN DATA
   Historical train journey / delay behavior

2. RAINFALL DATA
   Daily spatial rainfall over India

3. FLOOD INVENTORY
   Historical flood events with locations and dates

4. DFSI
   District-level flood severity / vulnerability information

Next task:
Connect these datasets geographically and temporally.
""")

print("✅ DATA AUDIT COMPLETE")