"""
Turns a raw ETA prediction into the explanation an admin (full) and a rider
(one line) actually read. Technique: XGBoost's own pred_contribs=True, which
returns exact SHAP-value contributions per feature per prediction -- no
separate 'shap' library needed. See master spec Section 6 / deep-dive Section 6.
"""
from dataclasses import dataclass

FEATURE_LABELS = {
    "current_delay_min": "existing delay already accrued",
    "flood_risk_ahead": "flood risk on the segment ahead",
    "road_congestion_index": "road congestion nearby",
    "hour_of_day": "time-of-day pattern",
    "segment_base_risk": "this segment's historical vulnerability",
    "rainfall_mm": "current rainfall intensity",
}


@dataclass
class Explanation:
    predicted_delay_min: float
    contributions: list  # [(feature, minutes_contributed), ...] sorted by |impact| desc
    admin_text: str
    rider_text: str


def explain_prediction(model, feature_order, feature_row: dict, label_overrides: dict | None = None) -> Explanation:
    """feature_row: dict of feature_name -> value, in the same schema used for training.

    label_overrides lets a caller relabel a feature for THIS prediction only --
    e.g. "flood_risk_ahead" really means "flood risk" only when rain is the
    actual cause; when the hazard segment is a manually-blocked track/road
    (accident, fallen tree, signal failure...), the explanation should name
    that real cause instead of defaulting to flood language.
    """
    import numpy as np
    import xgboost as xgb

    labels = {**FEATURE_LABELS, **(label_overrides or {})}

    x = np.array([[feature_row[f] for f in feature_order]], dtype=float)
    dmatrix = xgb.DMatrix(x, feature_names=feature_order)
    booster = model.get_booster()

    contribs = booster.predict(dmatrix, pred_contribs=True)[0]  # last element is bias term
    bias = contribs[-1]
    feature_contribs = list(zip(feature_order, contribs[:-1]))
    feature_contribs.sort(key=lambda t: -abs(t[1]))

    predicted = float(sum(c for _, c in feature_contribs) + bias)
    predicted = max(0.0, predicted)

    top = [(f, round(float(c), 1)) for f, c in feature_contribs if abs(c) >= 0.5]

    admin_lines = [f"Predicted additional delay: {predicted:.0f} min."]
    for f, c in top:
        sign = "+" if c >= 0 else ""
        admin_lines.append(f"  {labels.get(f, f)}: {sign}{c:.0f} min")
    admin_text = "\n".join(admin_lines)

    if top:
        leading_feature, leading_val = top[0]
        rider_text = f"{labels.get(leading_feature, leading_feature).capitalize()} flagged near your route."
    else:
        rider_text = "Minor timing adjustment."

    return Explanation(
        predicted_delay_min=round(predicted, 1),
        contributions=[(f, round(float(c), 2)) for f, c in feature_contribs],
        admin_text=admin_text,
        rider_text=rider_text,
    )
