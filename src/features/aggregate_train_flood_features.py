from pathlib import Path
import pandas as pd


# ============================================================
# PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

INPUT_PATH = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "railway"
    / "train_district_flood_exposure.csv"
)

OUTPUT_DIR = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "master"
)

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# LOAD
# ============================================================

print("Loading train-district exposure data...")

df = pd.read_csv(INPUT_PATH)

print(f"Rows: {len(df):,}")
print(f"Columns: {len(df.columns)}")


# ============================================================
# ENSURE NUMERIC COLUMNS
# ============================================================

df["dfsi"] = pd.to_numeric(
    df["dfsi"],
    errors="coerce"
)

df["historical_flood_events"] = pd.to_numeric(
    df["historical_flood_events"],
    errors="coerce"
).fillna(0)


# ============================================================
# RISK CATEGORY FLAGS
# ============================================================

df["is_high_risk"] = (
    df["flood_proneness"]
    .isin(["High", "Very High"])
    .astype(int)
)

df["is_very_high_risk"] = (
    df["flood_proneness"]
    .eq("Very High")
    .astype(int)
)


# ============================================================
# AGGREGATE TO TRAIN LEVEL
# ============================================================

train_features = (
    df.groupby("train_number")
    .agg(
        train_name=("train_name", "first"),
        from_station_name=("from_station_name", "first"),
        to_station_name=("to_station_name", "first"),

        distance_km=("distance_km", "first"),

        districts_crossed=("district", "nunique"),

        max_dfsi=("dfsi", "max"),
        mean_dfsi=("dfsi", "mean"),

        high_risk_districts=("is_high_risk", "sum"),
        very_high_risk_districts=("is_very_high_risk", "sum"),

        historical_flood_events_sum=(
            "historical_flood_events",
            "sum"
        ),

        historical_flood_events_max=(
            "historical_flood_events",
            "max"
        ),
    )
    .reset_index()
)


# ============================================================
# RISK COVERAGE
# ============================================================

train_features["route_has_high_risk_district"] = (
    train_features["high_risk_districts"] > 0
).astype(int)

train_features["route_has_very_high_risk_district"] = (
    train_features["very_high_risk_districts"] > 0
).astype(int)


# ============================================================
# NORMALIZED FLOOD EXPOSURE COMPONENT
# ============================================================
#
# This is a FEATURE ENGINEERING score, not an official
# government flood-risk probability.
#
# It combines:
#   - max district DFSI
#   - historical flood-event exposure
#
# We keep the components separately too, so XGBoost
# can learn their importance independently.
# ============================================================

if train_features["max_dfsi"].notna().any():

    max_dfsi = train_features["max_dfsi"].max()
    min_dfsi = train_features["max_dfsi"].min()

    if max_dfsi > min_dfsi:
        train_features["dfsi_normalized"] = (
            (train_features["max_dfsi"] - min_dfsi)
            / (max_dfsi - min_dfsi)
        )
    else:
        train_features["dfsi_normalized"] = 0.0

else:
    train_features["dfsi_normalized"] = 0.0


max_events = (
    train_features["historical_flood_events_sum"].max()
)

if max_events > 0:

    train_features["historical_flood_normalized"] = (
        train_features["historical_flood_events_sum"]
        / max_events
    )

else:
    train_features["historical_flood_normalized"] = 0.0


train_features["route_flood_exposure_score"] = (
    0.6 * train_features["dfsi_normalized"]
    +
    0.4 * train_features["historical_flood_normalized"]
)


# ============================================================
# SORT
# ============================================================

train_features = train_features.sort_values(
    "route_flood_exposure_score",
    ascending=False
)


# ============================================================
# SAVE
# ============================================================

output_path = (
    OUTPUT_DIR
    / "train_flood_features.csv"
)

train_features.to_csv(
    output_path,
    index=False
)


# ============================================================
# DISPLAY
# ============================================================

print("\n" + "=" * 80)
print("TOP FLOOD-EXPOSED TRAIN ROUTES")
print("=" * 80)

print(
    train_features[
        [
            "train_number",
            "train_name",
            "districts_crossed",
            "max_dfsi",
            "mean_dfsi",
            "high_risk_districts",
            "very_high_risk_districts",
            "historical_flood_events_sum",
            "route_flood_exposure_score",
        ]
    ]
    .head(20)
    .to_string(index=False)
)


print("\n" + "=" * 80)
print("SUMMARY")
print("=" * 80)

print(
    "Unique train routes:",
    f"{len(train_features):,}"
)

print(
    "Routes with high-risk district:",
    int(
        train_features[
            "route_has_high_risk_district"
        ].sum()
    )
)

print(
    "Routes with very-high-risk district:",
    int(
        train_features[
            "route_has_very_high_risk_district"
        ].sum()
    )
)

print("\n✅ TRAIN FLOOD FEATURES CREATED")
print(output_path)