from pathlib import Path
import json
import pandas as pd
import re


PROJECT_ROOT = Path(__file__).resolve().parents[2]

TRAIN_PATH = (
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


def normalize_number(value):
    if pd.isna(value):
        return None

    value = str(value).strip()

    # Remove decimal artifacts
    if value.endswith(".0"):
        value = value[:-2]

    # Keep digits
    digits = re.sub(r"\D", "", value)

    if not digits:
        return None

    # Remove leading zeros
    return str(int(digits))


def normalize_name(value):
    if pd.isna(value):
        return ""

    value = str(value).upper()

    # Remove common railway words
    value = re.sub(
        r"\b(JN|JUNCTION|CENTRAL|TERMINAL|ROAD|STATION|RAILWAY)\b",
        " ",
        value
    )

    # Remove punctuation
    value = re.sub(r"[^A-Z0-9 ]", " ", value)

    # Normalize spaces
    value = " ".join(value.split())

    return value


# ============================================================
# LOAD ETA DATA
# ============================================================

train = pd.read_csv(
    TRAIN_PATH,
    low_memory=False
)

train["train_number_norm"] = (
    train["train_number"]
    .apply(normalize_number)
)

train["train_name_norm"] = (
    train["train_number"]
    .astype(str)
)

eta_numbers = set(
    train["train_number_norm"]
    .dropna()
)

print("=" * 70)
print("ETA DATA")
print("=" * 70)

print("Rows:", len(train))
print("Unique train numbers:", len(eta_numbers))


# ============================================================
# LOAD TRAINS.JSON
# ============================================================

with open(
    REFERENCE_DIR / "trains.json",
    "r",
    encoding="utf-8"
) as f:
    trains_data = json.load(f)

train_features = (
    trains_data.get("features", [])
    if isinstance(trains_data, dict)
    else trains_data
)


geo_numbers = set()

for feature in train_features:

    props = feature.get("properties", {})

    number = normalize_number(
        props.get("number")
    )

    if number:
        geo_numbers.add(number)


# ============================================================
# LOAD SCHEDULES.JSON
# ============================================================

with open(
    REFERENCE_DIR / "schedules.json",
    "r",
    encoding="utf-8"
) as f:
    schedules = json.load(f)


schedule_numbers = set()

for row in schedules:

    number = normalize_number(
        row.get("train_number")
    )

    if number:
        schedule_numbers.add(number)


# ============================================================
# MATCHING
# ============================================================

match_geo = eta_numbers & geo_numbers
match_schedule = eta_numbers & schedule_numbers

match_any = eta_numbers & (
    geo_numbers | schedule_numbers
)


print("\n" + "=" * 70)
print("MATCHING RESULTS")
print("=" * 70)

print(
    f"Train numbers in ETA dataset: {len(eta_numbers):,}"
)

print(
    f"Train numbers in trains.json: {len(geo_numbers):,}"
)

print(
    f"Train numbers in schedules.json: {len(schedule_numbers):,}"
)

print(
    f"\nExact number match with trains.json: "
    f"{len(match_geo):,}"
)

print(
    f"Exact number match with schedules.json: "
    f"{len(match_schedule):,}"
)

print(
    f"Match using either source: "
    f"{len(match_any):,}"
)

print(
    f"\nCurrent trains.json percentage: "
    f"{len(match_geo) / len(eta_numbers) * 100:.2f}%"
)

print(
    f"Schedule percentage: "
    f"{len(match_schedule) / len(eta_numbers) * 100:.2f}%"
)

print(
    f"Combined percentage: "
    f"{len(match_any) / len(eta_numbers) * 100:.2f}%"
)


# ============================================================
# SHOW UNMATCHED EXAMPLES
# ============================================================

unmatched = sorted(
    eta_numbers - match_any
)

print("\n" + "=" * 70)
print("SAMPLE UNMATCHED TRAIN NUMBERS")
print("=" * 70)

print(unmatched[:100])


# ============================================================
# SHOW MATCHED EXAMPLES
# ============================================================

print("\n" + "=" * 70)
print("SAMPLE MATCHED TRAIN NUMBERS")
print("=" * 70)

print(sorted(match_any)[:50])