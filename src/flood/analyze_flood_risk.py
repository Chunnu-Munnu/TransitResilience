from pathlib import Path
import pandas as pd


# ============================================================
# PROJECT PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

DFSI_PATH = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "floods"
    / "DFSI.csv"
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

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ============================================================
# LOAD
# ============================================================

print("Loading datasets...")

dfsi = pd.read_csv(DFSI_PATH)
flood = pd.read_csv(FLOOD_PATH, low_memory=False)

print("✅ DFSI loaded")
print("✅ Flood inventory loaded")


# ============================================================
# CLEAN DFSI
# ============================================================

# In DFSI.csv, Unnamed: 0 contains the district name
dfsi = dfsi.rename(
    columns={
        "Unnamed: 0": "district"
    }
)

dfsi["district"] = (
    dfsi["district"]
    .astype(str)
    .str.strip()
)

dfsi["state"] = (
    dfsi["State_Name"]
    .astype(str)
    .str.strip()
    .str.upper()
)

dfsi["dfsi"] = pd.to_numeric(
    dfsi["DFSI"],
    errors="coerce"
)

dfsi_clean = dfsi[
    ["district", "state", "dfsi"]
].copy()


# ============================================================
# DFSI RELATIVE SCORE
# ============================================================

dfsi_min = dfsi_clean["dfsi"].min()
dfsi_max = dfsi_clean["dfsi"].max()

dfsi_clean["dfsi_relative_0_100"] = (
    (dfsi_clean["dfsi"] - dfsi_min)
    / (dfsi_max - dfsi_min)
    * 100
)

dfsi_clean["dfsi_rank"] = (
    dfsi_clean["dfsi"]
    .rank(
        ascending=False,
        method="min"
    )
    .astype("Int64")
)


# ============================================================
# FLOOD INVENTORY CLEANING
# ============================================================

if "Unnamed: 0" in flood.columns:
    flood = flood.drop(columns=["Unnamed: 0"])


# Unique flood event ID
flood["UEI"] = (
    flood["UEI"]
    .astype(str)
    .str.strip()
)


# ============================================================
# HISTORICAL FLOOD EVENT COUNT BY DISTRICT NAME
# ============================================================

district_events = (
    flood[
        ["UEI", "Districts"]
    ]
    .dropna(subset=["Districts"])
    .copy()
)

# Split comma-separated district lists
district_events["district"] = (
    district_events["Districts"]
    .astype(str)
    .str.split(",")
)

district_events = district_events.explode(
    "district"
)

district_events["district"] = (
    district_events["district"]
    .astype(str)
    .str.strip()
)

# Remove invalid values
district_events = district_events[
    ~district_events["district"].isin(
        ["", "nan", "NaN", "None"]
    )
]

# One district counts once per flood event
district_events = (
    district_events
    .drop_duplicates(
        subset=["UEI", "district"]
    )
)

historical_counts = (
    district_events
    .groupby("district")
    .size()
    .reset_index(
        name="historical_flood_events"
    )
)


# ============================================================
# NORMALIZE DISTRICT NAMES
# ============================================================

def normalize_name(value: str) -> str:
    value = str(value).upper().strip()

    # Remove common punctuation
    value = (
        value
        .replace("*", "")
        .replace(".", "")
        .replace("'", "")
    )

    # Normalize spaces
    value = " ".join(value.split())

    replacements = {
        "NORTH 24 PARGANAS":
            "NORTH TWENTY FOUR PARGANAS",

        "24 PARGANAS NORTH":
            "NORTH TWENTY FOUR PARGANAS",

        "SOUTH 24 PARGANAS":
            "SOUTH TWENTY FOUR PARGANAS",

        "24 PARGANAS SOUTH":
            "SOUTH TWENTY FOUR PARGANAS",
    }

    return replacements.get(
        value,
        value
    )


dfsi_clean["district_key"] = (
    dfsi_clean["district"]
    .apply(normalize_name)
)

historical_counts["district_key"] = (
    historical_counts["district"]
    .apply(normalize_name)
)


# ============================================================
# MERGE
# ============================================================

result = dfsi_clean.merge(
    historical_counts[
        [
            "district_key",
            "historical_flood_events"
        ]
    ],
    on="district_key",
    how="left"
)


result["historical_flood_events"] = (
    result["historical_flood_events"]
    .fillna(0)
    .astype(int)
)


# ============================================================
# FLOOD PRONENESS CATEGORY
# ============================================================

def classify_dfsi(score):
    if pd.isna(score):
        return "Unknown"

    if score <= 8:
        return "Low"

    if score <= 12:
        return "Moderate"

    if score <= 16:
        return "High"

    return "Very High"


result["flood_proneness"] = (
    result["dfsi"]
    .apply(classify_dfsi)
)


# ============================================================
# SORT
# ============================================================

most_prone = (
    result
    .sort_values(
        "dfsi",
        ascending=False
    )
)

least_prone = (
    result
    .sort_values(
        "dfsi",
        ascending=True
    )
)

most_events = (
    result
    .sort_values(
        "historical_flood_events",
        ascending=False
    )
)


# ============================================================
# PRINT RESULTS
# ============================================================

print("\n")
print("=" * 80)
print("MOST FLOOD-PRONE DISTRICTS")
print("=" * 80)

print(
    most_prone[
        [
            "district",
            "state",
            "dfsi",
            "historical_flood_events",
            "flood_proneness"
        ]
    ]
    .head(20)
    .to_string(index=False)
)


print("\n")
print("=" * 80)
print("LEAST FLOOD-PRONE DISTRICTS")
print("=" * 80)

print(
    least_prone[
        [
            "district",
            "state",
            "dfsi",
            "historical_flood_events",
            "flood_proneness"
        ]
    ]
    .head(20)
    .to_string(index=False)
)


print("\n")
print("=" * 80)
print("MOST HISTORICAL FLOOD EVENTS")
print("=" * 80)

print(
    most_events[
        [
            "district",
            "state",
            "dfsi",
            "historical_flood_events",
            "flood_proneness"
        ]
    ]
    .head(20)
    .to_string(index=False)
)


# ============================================================
# SAVE CSV
# ============================================================

output_csv = (
    OUTPUT_DIR
    / "district_flood_risk.csv"
)

result.to_csv(
    output_csv,
    index=False
)


# ============================================================
# SAVE EXCEL
# ============================================================

output_excel = (
    OUTPUT_DIR
    / "district_flood_risk.xlsx"
)

with pd.ExcelWriter(
    output_excel,
    engine="openpyxl"
) as writer:

    result.to_excel(
        writer,
        sheet_name="All_Districts",
        index=False
    )

    most_prone.head(20).to_excel(
        writer,
        sheet_name="Most_Flood_Prone",
        index=False
    )

    least_prone.head(20).to_excel(
        writer,
        sheet_name="Least_Flood_Prone",
        index=False
    )

    most_events.head(20).to_excel(
        writer,
        sheet_name="Most_Historical_Events",
        index=False
    )


# ============================================================
# FINAL
# ============================================================

print("\n")
print("=" * 80)
print("✅ FLOOD ANALYSIS COMPLETE")
print("=" * 80)

print(f"CSV:")
print(output_csv)

print("\nExcel:")
print(output_excel)