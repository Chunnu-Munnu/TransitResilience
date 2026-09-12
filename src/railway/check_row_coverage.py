from pathlib import Path
import json
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[2]

TRAIN_PATH = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "railway"
    / "ir_train.csv"
)

TRAINS_PATH = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "railway"
    / "reference"
    / "datameet_railways"
    / "trains.json"
)


def normalize_number(value):
    if pd.isna(value):
        return None

    value = str(value).strip()

    if value.endswith(".0"):
        value = value[:-2]

    digits = "".join(c for c in value if c.isdigit())

    if not digits:
        return None

    return str(int(digits))


# Load ETA data
train = pd.read_csv(
    TRAIN_PATH,
    low_memory=False
)

train["train_number_clean"] = (
    train["train_number"]
    .apply(normalize_number)
)


# Load geographic trains
with open(
    TRAINS_PATH,
    "r",
    encoding="utf-8"
) as f:
    data = json.load(f)

features = (
    data.get("features", [])
    if isinstance(data, dict)
    else data
)

geo_numbers = set()

for feature in features:
    props = feature.get("properties", {})
    number = normalize_number(
        props.get("number")
    )

    if number:
        geo_numbers.add(number)


# Identify matched rows
train["geo_match"] = (
    train["train_number_clean"]
    .isin(geo_numbers)
)


matched_rows = int(train["geo_match"].sum())
total_rows = len(train)

row_percentage = (
    matched_rows / total_rows * 100
)


print("=" * 70)
print("ROW-LEVEL COVERAGE")
print("=" * 70)

print(f"Total ETA records:       {total_rows:,}")
print(f"Matched ETA records:     {matched_rows:,}")
print(f"Unmatched ETA records:   {total_rows - matched_rows:,}")

print(
    f"\nRow coverage:            {row_percentage:.2f}%"
)


# Average records per train number
matched_train_numbers = (
    train.loc[
        train["geo_match"],
        "train_number_clean"
    ]
    .nunique()
)

print(
    f"\nMatched train numbers:   {matched_train_numbers:,}"
)

print(
    f"Average rows per matched train: "
    f"{matched_rows / matched_train_numbers:.1f}"
)


# Top matched train numbers by frequency
print("\n" + "=" * 70)
print("MOST FREQUENT MATCHED TRAINS")
print("=" * 70)

print(
    train.loc[train["geo_match"], "train_number_clean"]
    .value_counts()
    .head(20)
    .to_string()
)