"""
Incident/news text classifier (master spec Section 4.5). Two implementations
behind one function:

  1. Keyword classifier (always available, zero dependencies, zero latency) --
     the default, and the one used if no Gemini key is configured or the API
     call fails for any reason.
  2. Gemini-backed classifier (backend/config.py's GEMINI_API_KEY) -- a real
     LLM reading the free-text report and extracting the same fields.

Either way, the OUTPUT SHAPE is identical -- this is deliberately the same
"swap the sensor, keep the event schema" pattern used throughout this
project. And per the frontend spec's explicit rule: this LLM touches
incident TEXT PARSING only. It never explains an ETA/optimizer decision and
it never sets the schedule -- that stays deterministic (XGBoost + CP-SAT).
"""
import json
import urllib.error
import urllib.request

from backend.config import GEMINI_API_KEY, GEMINI_MODEL

KEYWORDS = {
    "flood": ["waterlog", "flood", "submerged", "rain"],
    "incident": ["fight", "scuffle", "fire", "altercation", "unsafe", "smoke"],
    "maintenance": ["signal failure", "signal", "brake", "inspection", "breakdown"],
    "traffic": ["congestion", "traffic", "jam", "gridlock"],
}
DEFAULT_SEVERITY = {"flood": 0.7, "incident": 0.5, "maintenance": 0.5, "traffic": 0.3}
VALID_TYPES = set(KEYWORDS.keys())


def _keyword_classify(text: str) -> tuple[str, float]:
    text_l = text.lower()
    for etype, words in KEYWORDS.items():
        if any(w in text_l for w in words):
            return etype, DEFAULT_SEVERITY[etype]
    return "incident", DEFAULT_SEVERITY["incident"]


def _gemini_classify(text: str) -> tuple[str, float] | None:
    """Returns (type, severity) or None if the call fails for any reason --
    callers must fall back to the keyword classifier on None."""
    if not GEMINI_API_KEY:
        return None

    prompt = (
        "Classify this transit incident report into exactly one type from "
        "[flood, incident, maintenance, traffic], and estimate a severity from 0.0 to 1.0. "
        'Respond with ONLY compact JSON like {"type": "flood", "severity": 0.7}. '
        f"Report: {text}"
    )
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode()

    try:
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read())
        raw = data["candidates"][0]["content"]["parts"][0]["text"]
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        parsed = json.loads(raw)
        etype = parsed.get("type")
        severity = float(parsed.get("severity", 0.5))
        if etype not in VALID_TYPES:
            return None
        return etype, max(0.0, min(1.0, severity))
    except (urllib.error.URLError, TimeoutError, KeyError, IndexError, ValueError, json.JSONDecodeError):
        return None  # any failure at all -- network, quota, bad JSON -- just fall back


def classify(text: str, location: str, source: str = "news_nlp") -> dict:
    result = _gemini_classify(text)
    method = "gemini"
    if result is None:
        result = _keyword_classify(text)
        method = "keyword"
    etype, severity = result

    return {
        "type": etype,
        "location": location,
        "severity": severity,
        "onset_minutes": 0,
        "duration_minutes": 60,
        "source": source,
        "raw_text": text,
        "classified_by": method,
    }
