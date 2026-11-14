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
        requested_latitude=45.4215, requested_longitude=-75.6972, cell_latitude=45.5, cell_longitude=-75.625,
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


def test_variables_lists_supported_variables_with_units_and_description() -> None:
    response = client.get("/api/variables")
    assert response.status_code == 200
    variables = {v["id"]: v for v in response.json()}
    assert set(variables) == {"T2M", "PRECTOTCORR", "RH2M"}
    assert all(v["coverage_start_year"] == 1981 for v in variables.values())
    t2m = variables["T2M"]
    assert t2m["unit"] == "C"
    assert t2m["trend_unit"] == "C/decade"
    assert "2 meters" in t2m["description"]
    assert (variables["PRECTOTCORR"]["unit"], variables["PRECTOTCORR"]["trend_unit"]) == ("mm/day", "mm/day/decade")
    assert (variables["RH2M"]["unit"], variables["RH2M"]["trend_unit"]) == ("%", "percentage points/decade")


def test_trends_returns_complete_contract(monkeypatch) -> None:
    _mock_nasa(monkeypatch, _series(1990, 2025, drop={(2000, 3)}))
    response = client.get("/api/trends", params=TRENDS_PARAMS)
    assert response.status_code == 200
    body = response.json()
    assert body["variable"] == {"id": "T2M", "name": "Air temperature at 2 m", "unit": "C", "trend_unit": "C/decade"}
    assert body["data_origin"] == "live"
    assert body["location"]["cell_latitude"] == 45.5
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


def test_trends_precipitation_keeps_precision_and_units(monkeypatch) -> None:
    # 0.002 mm/day per year = 0.02 mm/day per decade, which must not be rounded away
    series = _series(1990, 2025, per_year=0.002).model_copy(update={"parameter": "PRECTOTCORR", "unit": "mm/day"})
    _mock_nasa(monkeypatch, series)
    body = client.get("/api/trends", params={**TRENDS_PARAMS, "variable": "PRECTOTCORR"}).json()
    assert body["variable"]["id"] == "PRECTOTCORR"
    assert body["variable"]["trend_unit"] == "mm/day/decade"
    assert body["trend"]["slope_per_decade"] == pytest.approx(0.02, abs=1e-4)
    assert "increased by an estimated 0.020 mm/day per decade" in body["interpretation"]


def test_trends_humidity_reports_percentage_points(monkeypatch) -> None:
    series = _series(1990, 2025, per_year=-0.03).model_copy(update={"parameter": "RH2M", "unit": "%"})
    _mock_nasa(monkeypatch, series)
    body = client.get("/api/trends", params={**TRENDS_PARAMS, "variable": "RH2M"}).json()
    assert body["variable"]["trend_unit"] == "percentage points/decade"
    assert body["trend"]["slope_per_decade"] == pytest.approx(-0.3, abs=1e-3)
    assert "decreased by an estimated 0.30 percentage points per decade" in body["interpretation"]


def test_trends_warns_when_change_is_implausibly_large_for_the_local_mean(monkeypatch) -> None:
    # Mean ~10 and total change 0.05 * 35 = 1.75 is small; 0.5 per year gives +175%, which must be flagged
    series = _series(1990, 2025, per_year=0.5).model_copy(update={"parameter": "PRECTOTCORR", "unit": "mm/day"})
    _mock_nasa(monkeypatch, series)
    body = client.get("/api/trends", params={**TRENDS_PARAMS, "variable": "PRECTOTCORR"}).json()
    assert len(body["warnings"]) == 1 and "implausibly large" in body["warnings"][0]


def test_trends_has_no_warning_for_plausible_precipitation_or_for_temperature(monkeypatch) -> None:
    plausible = _series(1990, 2025, per_year=0.02).model_copy(update={"parameter": "PRECTOTCORR", "unit": "mm/day"})
    _mock_nasa(monkeypatch, plausible)
    assert client.get("/api/trends", params={**TRENDS_PARAMS, "variable": "PRECTOTCORR"}).json()["warnings"] == []
    # Temperature is never screened, even with a huge change
    _mock_nasa(monkeypatch, _series(1990, 2025, per_year=0.5))
    assert client.get("/api/trends", params=TRENDS_PARAMS).json()["warnings"] == []
