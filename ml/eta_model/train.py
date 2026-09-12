"""
Trains the hazard-aware ETA model (Section 5 of the master spec).

Why this exists and why it's built this way is explained in full in
TransitResilience_Technical_Deep_Dive.md (Section 6). Short version:
GBDT (XGBoost) on tabular features, because the data is small, tabular,
needs to be explainable per-prediction, and needs to train/predict fast.

The training set is SYNTHETIC (we have no real Mumbai-suburban delay log —
see docs/DATA_SOURCES.md) but the rainfall feature is bootstrapped from the
REAL 10-year NASA POWER series, and the delay-generation formula is anchored
to the REAL 64.5mm/24h disruption threshold computed from that same real data.
This is the "vertical slice, real architecture, simulated live data" pattern
already used throughout this project — never presented as real delay history.

Run: python ml/eta_model/train.py
Output: ml/eta_model/artifacts/eta_model.json
"""
import json
import random
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error

random.seed(7)
np.random.seed(7)

ROOT = Path(__file__).resolve().parents[2]
SYN = ROOT / "data" / "synthetic"
RAW = ROOT / "data" / "raw"
ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)

FEATURES = [
    "current_delay_min",
    "flood_risk_ahead",
    "road_congestion_index",
    "hour_of_day",
    "segment_base_risk",
    "rainfall_mm",
]


def load_real_monsoon_rainfall():
    """Bootstrap source: the REAL rainfall values, not a made-up distribution."""
    path = RAW / "rainfall" / "mumbai_daily_rainfall_2015_2024_NASA_POWER.csv"
    values = []
    started = False
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("YEAR"):
                started = True
                continue
            if not started:
                continue
            parts = line.strip().split(",")
            if len(parts) != 3:
                continue
            _, doy, val = parts
            try:
                val = float(val)
                doy_i = int(doy)
            except ValueError:
                continue
            if val >= 0 and 152 <= doy_i <= 273:  # monsoon days only
                values.append(val)
    return values


def build_synthetic_dataset(n=6000):
    corridor = json.loads((SYN / "corridor.json").read_text())
    segments = corridor["segments"]
    monsoon_rain = load_real_monsoon_rainfall()
    calib = json.loads((SYN / "rainfall_calibration.json").read_text())
    threshold = calib["disruption_threshold_mm"]

    rows = []
    for _ in range(n):
        seg = random.choice(segments)
        rainfall_mm = random.choice(monsoon_rain)
        current_delay = max(0.0, np.random.normal(2.0, 2.5))
        congestion = np.random.uniform(0.05, 0.9)
        hour = random.randint(6, 23)

        excess = max(0.0, rainfall_mm - threshold)
        flood_risk = min(1.0, (excess / 100.0) + seg["base_risk"])

        # The ground-truth generating formula: flood risk dominates, matching
        # the real-world pattern published research shows (rain -> delay, network-structural).
        additional_delay = (
            0.3 * current_delay
            + 60.0 * flood_risk
            + 5.0 * congestion
            + np.random.normal(0, 3.0)
        )
        additional_delay = max(0.0, additional_delay)

        rows.append({
            "current_delay_min": round(current_delay, 2),
            "flood_risk_ahead": round(flood_risk, 4),
            "road_congestion_index": round(congestion, 3),
            "hour_of_day": hour,
            "segment_base_risk": seg["base_risk"],
            "rainfall_mm": round(rainfall_mm, 2),
            "additional_delay_min": round(additional_delay, 2),
        })

    return pd.DataFrame(rows)


def main():
    df = build_synthetic_dataset()
    X, y = df[FEATURES], df["additional_delay_min"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=7)

    model = xgb.XGBRegressor(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.08,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="reg:squarederror",
    )
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    mae = mean_absolute_error(y_test, preds)
    print(f"Test MAE: {mae:.2f} minutes  (n_test={len(X_test)})")

    importance = dict(zip(FEATURES, [round(float(v), 4) for v in model.feature_importances_]))
    print("Feature importance:", json.dumps(importance, indent=2))

    model.save_model(str(ARTIFACTS / "eta_model.json"))
    (ARTIFACTS / "feature_order.json").write_text(json.dumps(FEATURES))
    (ARTIFACTS / "metrics.json").write_text(json.dumps({"test_mae_min": round(mae, 3), "feature_importance": importance}, indent=2))
    print(f"Saved model to {ARTIFACTS / 'eta_model.json'}")


if __name__ == "__main__":
    main()
