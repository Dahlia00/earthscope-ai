import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import MonthlyObservation, MonthlySeries
from app.services import nasa_power
from app.services.nasa_power import NasaPowerError

client = TestClient(app)

TRENDS_PARAMS = {"latitude": 45.4215, "longitude": -75.6972, "variable": "T2M", "start_year": 1990, "end_year": 2025}


def _series(start: int, end: int, per_year: float = 0.05, drop: set[tuple[int, int]] = frozenset()) -> MonthlySeries:
    obs = [
        MonthlyObservation(year=y, month=m, value=10 + per_year * (y - start))
        for y in range(start, end + 1)
        for m in range(1, 13)
        if (y, m) not in drop
    ]
    return MonthlySeries(
        parameter="T2M", long_name="Temperature at 2 Meters", unit="C", source="NASA POWER (MERRA2)",
        requested_latitude=45.4215, requested_longitude=-75.6972, grid_latitude=45.422, grid_longitude=-75.697,
        elevation_m=123.92, observations=obs, missing_count=len(drop),
    )


def _mock_nasa(monkeypatch, series: MonthlySeries | Exception) -> None:
    def fake(*args, **kwargs):
        if isinstance(series, Exception):
            raise series
        return series

    monkeypatch.setattr(nasa_power, "fetch_monthly_series", fake)


def test_health() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "EarthScope AI Backend"}


def test_cors_allows_nextjs_dev_server() -> None:
    response = client.get("/api/health", headers={"Origin": "http://localhost:3000"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_variables_lists_t2m_with_units_and_description() -> None:
    response = client.get("/api/variables")
    assert response.status_code == 200
    variables = {v["id"]: v for v in response.json()}
    assert set(variables) == {"T2M"}
    t2m = variables["T2M"]
    assert t2m["unit"] == "C"
    assert t2m["trend_unit"] == "C/decade"
    assert t2m["coverage_start_year"] == 1981
    assert "2 meters" in t2m["description"]


def test_trends_returns_complete_contract(monkeypatch) -> None:
    _mock_nasa(monkeypatch, _series(1990, 2025, drop={(2000, 3)}))
    response = client.get("/api/trends", params=TRENDS_PARAMS)
    assert response.status_code == 200
    body = response.json()
    assert body["variable"] == {"id": "T2M", "name": "Air temperature at 2 m", "unit": "C"}
    assert body["data_origin"] == "live"
    assert body["location"]["grid_latitude"] == 45.422
    assert body["counts"]["monthly_valid"] == 36 * 12 - 1
    assert body["counts"]["monthly_missing"] == 1
    assert body["counts"]["incomplete_years_excluded"] == [2000]
    assert body["counts"]["annual_complete"] == 35
    assert len(body["annual_values"]) == 35
    assert all(a["year"] != 2000 for a in body["annual_values"])
    trend = body["trend"]
    assert trend["slope_per_decade"] == pytest.approx(0.5, abs=0.01)
    assert trend["significant"] is True and trend["p_value"] < 0.05
    assert trend["ci_lower_per_decade"] <= trend["slope_per_decade"] <= trend["ci_upper_per_decade"]
    assert len(trend["trend_line"]) == 35
    assert "statistically significant" in body["interpretation"]
    assert body["limitations"]


def test_trends_validates_inputs(monkeypatch) -> None:
    _mock_nasa(monkeypatch, _series(1990, 2025))
    for override in (
        {"latitude": 91}, {"latitude": -91}, {"longitude": 181}, {"variable": "XYZ"},
        {"start_year": 1970}, {"start_year": 2020, "end_year": 2010}, {"end_year": 2999},
    ):
        response = client.get("/api/trends", params={**TRENDS_PARAMS, **override})
        assert response.status_code == 422, override


def test_trends_requires_all_parameters() -> None:
    assert client.get("/api/trends", params={"latitude": 1, "longitude": 1}).status_code == 422


def test_trends_with_too_few_years_is_422_not_a_made_up_trend(monkeypatch) -> None:
    _mock_nasa(monkeypatch, _series(2020, 2025))
    response = client.get("/api/trends", params={**TRENDS_PARAMS, "start_year": 2020})
    assert response.status_code == 422
    assert "complete years" in response.json()["detail"]


def test_trends_nasa_failure_is_502_without_fallback(monkeypatch) -> None:
    _mock_nasa(monkeypatch, NasaPowerError("NASA POWER request timed out"))
    response = client.get("/api/trends", params={**TRENDS_PARAMS, "latitude": 10.0, "longitude": 20.0})
    assert response.status_code == 502
    assert "timed out" in response.json()["detail"]


def test_nasa_outage_serves_labelled_snapshot_only_for_exact_saved_request(monkeypatch) -> None:
    _mock_nasa(monkeypatch, NasaPowerError("NASA POWER request timed out"))
    response = client.get("/api/trends", params=TRENDS_PARAMS)
    assert response.status_code == 200
    body = response.json()
    assert body["data_origin"] == "snapshot"
    assert body["retrieved_at"].startswith("2026-")
    assert body["counts"]["monthly_valid"] == 432
    assert body["trend"]["slope_per_decade"] == pytest.approx(0.50, abs=0.01)

    # A different request must not be answered with Ottawa's data
    other = client.get("/api/trends", params={**TRENDS_PARAMS, "latitude": 46.0})
    assert other.status_code == 502
