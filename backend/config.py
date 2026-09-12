"""
Tiny dependency-free .env loader (deliberately not python-dotenv -- adding a
new pip dependency mid-session would require everyone re-running `pip
install`, which is worse than 8 lines of stdlib). Reads TransitResilience-
Platform/.env once at import time.

.env is gitignored -- never commit real keys. GEMINI_API_KEY here is used
ONLY by backend/event_bus/incident_classifier.py to parse free-text incident
reports into the same event schema everything else uses. It is never used
for ETA prediction or the optimizer's decisions -- see the frontend spec's
explicit "do not use an LLM to generate critical explanation text" rule.
"""
import os
from pathlib import Path

_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"


def _load_dotenv():
    if not _ENV_PATH.exists():
        return
    for line in _ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")
