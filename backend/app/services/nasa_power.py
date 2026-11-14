"""NASA POWER monthly point client and response parser.

Response format (verified against API v2.10.0):
  properties.parameter.<PARAM> is a dict keyed "YYYYMM". Month "13" is NASA's own
  annual aggregate, so it is skipped here; annual values are derived from the
  monthly data later. header.fill_value (-999.0) marks missing data.
"""

import math
import re

import httpx

from app.config import get_settings
from app.models.schemas import MonthlyObservation, MonthlySeries

_KEY_PATTERN = re.compile(r"^(\d{4})(\d{2})$")
_DEFAULT_FILL_VALUE = -999.0


class NasaPowerError(Exception):
    """NASA POWER could not be reached or returned something unusable."""


def parse_monthly_response(
    payload: dict, parameter: str, requested_latitude: float, requested_longitude: float
) -> MonthlySeries:
    try:
        values = payload["properties"]["parameter"][parameter]
        meta = payload["parameters"][parameter]
        coords = payload["geometry"]["coordinates"]
    except (KeyError, TypeError) as exc:
        raise NasaPowerError(f"Unexpected NASA POWER response: missing {exc}") from exc

    header = payload.get("header", {})
    fill_value = float(header.get("fill_value", _DEFAULT_FILL_VALUE))
    sources = header.get("sources") or []

    observations: list[MonthlyObservation] = []
    missing = 0
    for key, raw in values.items():
        match = _KEY_PATTERN.match(key)
        if not match:
            raise NasaPowerError(f"Unexpected time key in NASA POWER response: {key!r}")
        year, month = int(match.group(1)), int(match.group(2))
        if month == 13:
            continue
        if not 1 <= month <= 12:
            raise NasaPowerError(f"Invalid month in NASA POWER response: {key!r}")
        if (
            not isinstance(raw, (int, float))
            or isinstance(raw, bool)
            or not math.isfinite(raw)
            or raw == fill_value
        ):
            missing += 1
            continue
        observations.append(MonthlyObservation(year=year, month=month, value=float(raw)))

    observations.sort(key=lambda o: (o.year, o.month))
    return MonthlySeries(
        parameter=parameter,
        long_name=meta.get("longname", parameter),
        unit=meta.get("units", ""),
        source="NASA POWER (" + ", ".join(sources) + ")" if sources else "NASA POWER",
        requested_latitude=requested_latitude,
        requested_longitude=requested_longitude,
        grid_latitude=coords[1],
        grid_longitude=coords[0],
        elevation_m=coords[2] if len(coords) > 2 else None,
        observations=observations,
        missing_count=missing,
    )


def fetch_monthly_series(
    latitude: float,
    longitude: float,
    parameter: str,
    start_year: int,
    end_year: int,
    client: httpx.Client | None = None,
) -> MonthlySeries:
    settings = get_settings()
    url = f"{settings.nasa_power_base_url}/temporal/monthly/point"
    params = {
        "parameters": parameter,
        "community": "RE",
        "latitude": latitude,
        "longitude": longitude,
        "format": "JSON",
        "start": start_year,
        "end": end_year,
    }
    owns_client = client is None
    client = client or httpx.Client(timeout=settings.nasa_power_timeout_seconds)
    try:
        response = client.get(url, params=params)
        response.raise_for_status()
        payload = response.json()
    except httpx.TimeoutException as exc:
        raise NasaPowerError("NASA POWER request timed out") from exc
    except httpx.HTTPStatusError as exc:
        raise NasaPowerError(f"NASA POWER returned HTTP {exc.response.status_code}") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise NasaPowerError(f"NASA POWER request failed: {exc}") from exc
    finally:
        if owns_client:
            client.close()
    return parse_monthly_response(payload, parameter, latitude, longitude)


if __name__ == "__main__":
    series = fetch_monthly_series(45.4215, -75.6972, "T2M", 1990, 2025)
    obs = series.observations
    print(f"{series.long_name} [{series.unit}] from {series.source}")
    print(f"Grid cell: {series.grid_latitude}, {series.grid_longitude} ({series.elevation_m} m)")
    print(f"{len(obs)} valid monthly observations, {series.missing_count} missing")
    print(f"First: {obs[0]}\nLast:  {obs[-1]}")
