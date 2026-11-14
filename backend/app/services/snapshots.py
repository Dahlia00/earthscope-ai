"""Saved copies of real NASA POWER responses, used only when NASA is unreachable.

A snapshot is the unmodified NASA payload plus when it was retrieved. It is served only for the exact
request it was saved for, and responses built from it are labelled data_origin="snapshot".

Create one:  python -m app.services.snapshots [lat lon variable start_year end_year]
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from app.config import get_settings
from app.models.schemas import MonthlySeries
from app.services.nasa_power import fetch_monthly_payload, parse_monthly_response


def snapshot_path(snapshot_dir: Path, latitude: float, longitude: float, variable: str, start: int, end: int) -> Path:
    # Built only from validated numbers and a registry variable id, so it cannot escape snapshot_dir
    return snapshot_dir / f"{variable}_{latitude:.4f}_{longitude:.4f}_{start}_{end}.json"


def load_snapshot(
    snapshot_dir: Path, latitude: float, longitude: float, variable: str, start: int, end: int
) -> tuple[MonthlySeries, str] | None:
    path = snapshot_path(snapshot_dir, latitude, longitude, variable, start, end)
    if not path.is_file():
        return None
    saved = json.loads(path.read_text())
    return parse_monthly_response(saved["payload"], variable, latitude, longitude), saved["retrieved_at"]


def save_snapshot(snapshot_dir: Path, latitude: float, longitude: float, variable: str, start: int, end: int) -> Path:
    payload = fetch_monthly_payload(latitude, longitude, variable, start, end)
    parse_monthly_response(payload, variable, latitude, longitude)  # refuse to save an unusable response
    path = snapshot_path(snapshot_dir, latitude, longitude, variable, start, end)
    path.parent.mkdir(parents=True, exist_ok=True)
    retrieved_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    path.write_text(json.dumps({"retrieved_at": retrieved_at, "payload": payload}))
    return path


if __name__ == "__main__":
    args = sys.argv[1:]
    lat, lon, var, start, end = (45.4215, -75.6972, "T2M", 1990, 2025) if not args else (
        float(args[0]), float(args[1]), args[2], int(args[3]), int(args[4])
    )
    print(save_snapshot(get_settings().snapshot_dir, lat, lon, var, start, end))
