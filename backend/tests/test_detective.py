from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy.stats import false_discovery_control

from app.config import Settings, get_settings
from app.main import app
from app.models.schemas import TrendGrid
from app.services.detective import find_hotspots
from app.services.layers import LAYERS

client = TestClient(app)
LAYER = next(layer for layer in LAYERS if layer.id == "temperature_trend")
N_LAT, N_LON, LAT_STEP, LON_STEP = 41, 72, 4.5, 5.0  # lat -90..90, lon -180..175 (full circle)


def _write_grid(
    path: Path, slope: np.ndarray, p: np.ndarray, variable: str = "T2M", baseline: np.ndarray | None = None
) -> Path:
    def lists(a: np.ndarray) -> list[list[float | None]]:
        return [[None if np.isnan(v) else float(v) for v in row] for row in a]

    grid = TrendGrid(
        layer_id="temperature_trend", variable=variable, unit="C", trend_unit="C/decade", source="synthetic",
        method="synthetic", period_start_year=1981, period_end_year=2025, significance_level=0.05,
        lat={"start": -90.0, "step": LAT_STEP, "count": N_LAT}, lon={"start": -180.0, "step": LON_STEP, "count": N_LON},
        slope=lists(slope), p_value=lists(p), baseline=None if baseline is None else lists(baseline),
    )
    path.write_text(grid.model_dump_json())
    return path


REGION_A = (range(20, 25), range(10, 15))  # +25 cells, highest score
REGION_B = (range(10, 15), range(30, 35))  # -25 cells
REGION_C = (range(25, 28), [70, 71, 0, 1])  # +12 cells across the antimeridian


def _planted(tmp_path: Path, variable: str = "T2M", baselines: dict[str, float] | None = None):
    """Quiet background plus known blocks: +25 cells, -25 cells, +12 cells across the antimeridian, 1 lone cell."""
    rng = np.random.default_rng(0)
    slope = rng.normal(0, 0.05, (N_LAT, N_LON))
    p = rng.uniform(0.2, 1.0, (N_LAT, N_LON))
    slope[0, :], p[0, :] = np.nan, np.nan  # null row
    for rows, cols, value in [(*REGION_A, 1.0), (*REGION_B, -1.0), (*REGION_C, 1.0), ([30], [50], 1.0)]:
        for r in rows:
            for c in cols:
                slope[r, c], p[r, c] = value, 1e-6
    baseline = None
    if baselines is not None:
        baseline = np.full((N_LAT, N_LON), 100.0)
        for name, region in {"A": REGION_A, "B": REGION_B, "C": REGION_C}.items():
            for r in region[0]:
                for c in region[1]:
                    baseline[r, c] = baselines.get(name, 100.0)
    return _write_grid(tmp_path / "grid.json", slope, p, variable, baseline)


def test_planted_regions_are_found_with_correct_geometry(tmp_path: Path) -> None:
    result = find_hotspots(_planted(tmp_path), LAYER, "both", 10)
    assert result.counts.valid_cells == (N_LAT - 1) * N_LON
    assert result.counts.fdr_significant_cells == 63
    assert result.counts.regions_found == 4 and result.counts.regions_after_min_size == 3
    assert sorted((h.direction, h.n_cells) for h in result.hotspots) == [
        ("decrease", 25), ("increase", 12), ("increase", 25),
    ]
    assert [h.rank for h in result.hotspots] == [1, 2, 3]
    assert [h.score for h in result.hotspots] == sorted((h.score for h in result.hotspots), reverse=True)

    block = next(h for h in result.hotspots if h.direction == "increase" and h.n_cells == 25)
    assert block.centroid.latitude == pytest.approx(9.0, abs=1.0) and block.centroid.longitude == pytest.approx(-120.0, abs=0.5)
    assert block.mean_slope == pytest.approx(1.0)
    assert block.total_change == pytest.approx(1.0 * 44 / 10)
    # the drill-down cell is a real member of the region
    assert -135 <= block.drilldown.longitude <= -115 and 0 <= block.drilldown.latitude <= 18


def test_region_across_antimeridian_is_one_region(tmp_path: Path) -> None:
    result = find_hotspots(_planted(tmp_path), LAYER, "increase", 10)
    wrap = next(h for h in result.hotspots if h.n_cells == 12)
    assert wrap.bounds.crosses_antimeridian
    assert wrap.bounds.west == pytest.approx(167.5) and wrap.bounds.east == pytest.approx(-172.5)
    assert abs(wrap.centroid.longitude) == pytest.approx(177.5, abs=0.5)


def test_direction_and_limit_filters(tmp_path: Path) -> None:
    grid = _planted(tmp_path)
    assert {h.direction for h in find_hotspots(grid, LAYER, "decrease", 10).hotspots} == {"decrease"}
    assert len(find_hotspots(grid, LAYER, "both", 1).hotspots) == 1


def test_fdr_removes_chance_findings_in_pure_noise(tmp_path: Path) -> None:
    rng = np.random.default_rng(11)
    p = rng.uniform(0, 1, (N_LAT, N_LON))
    grid = _write_grid(tmp_path / "noise.json", rng.normal(0, 1, (N_LAT, N_LON)), p)
    assert (p < 0.05).sum() > 50  # a raw 5% test would "find" these
    assert (false_discovery_control(p.ravel()) <= 0.05).sum() == 0
    result = find_hotspots(grid, LAYER, "both", 10)
    assert result.counts.fdr_significant_cells == 0 and result.hotspots == []


def test_real_temperature_grid_ranks_arctic_amplification_first() -> None:
    # Arctic warming faster than the rest of the globe is well documented, so it must dominate.
    grid = Settings().grid_data_dir / "temperature_trend.json"
    top = find_hotspots(grid, LAYER, "both", 3).hotspots
    assert top[0].direction == "increase" and top[0].centroid.latitude > 65
    assert all(h.centroid.latitude > 65 for h in top)


@pytest.fixture
def grid_dir(tmp_path: Path):
    app.dependency_overrides[get_settings] = lambda: Settings(grid_data_dir=tmp_path)
    yield tmp_path
    app.dependency_overrides.clear()


def test_endpoint_returns_hotspots_for_built_grid(grid_dir: Path) -> None:
    _planted(grid_dir).rename(grid_dir / "temperature_trend.json")
    response = client.get("/api/detective/hotspots", params={"layer_id": "temperature_trend", "limit": 2})
    assert response.status_code == 200
    body = response.json()
    assert len(body["hotspots"]) == 2 and body["layer_id"] == "temperature_trend"
    assert body["limitations"] and body["parameters"]["fdr_q"] == 0.05


def test_endpoint_errors(grid_dir: Path) -> None:
    url = "/api/detective/hotspots"
    assert client.get(url, params={"layer_id": "temperature_trend"}).status_code == 503  # not built
    assert client.get(url, params={"layer_id": "nope"}).status_code == 404
    assert client.get(url, params={"layer_id": "vegetation_evi"}).status_code == 404  # imagery, no grid
    assert client.get(url).status_code == 422
    assert client.get(url, params={"layer_id": "temperature_trend", "direction": "up"}).status_code == 422
    assert client.get(url, params={"layer_id": "temperature_trend", "limit": 0}).status_code == 422
    assert client.get(url, params={"layer_id": "temperature_trend", "limit": 51}).status_code == 422


PRECIP = next(layer for layer in LAYERS if layer.id == "precipitation_trend")


def test_implausibly_large_change_is_flagged_and_ranked_last_despite_top_score(tmp_path: Path) -> None:
    # Region A has the highest raw score but its change (4.4) is 220% of its local mean (2.0)
    grid = _planted(tmp_path, variable="PRECTOTCORR", baselines={"A": 2.0})
    result = find_hotspots(grid, PRECIP, "both", 10)
    flags = [(h.n_cells, h.direction, h.quality_flag) for h in result.hotspots]
    assert flags[-1] == (25, "increase", "suspect_magnitude")
    assert all(f[2] == "ok" for f in flags[:-1])
    suspect = result.hotspots[-1]
    assert suspect.relative_change == pytest.approx(2.2) and suspect.baseline_mean == pytest.approx(2.0)
    assert "implausibly" in suspect.warning
    assert result.counts.suspect_regions == 1 and result.layer_warning is None
    assert [h.rank for h in result.hotspots] == [1, 2, 3]


def test_layer_warning_when_most_regions_are_suspect(tmp_path: Path) -> None:
    grid = _planted(tmp_path, variable="PRECTOTCORR", baselines={"A": 2.0, "B": 2.0})
    result = find_hotspots(grid, PRECIP, "both", 10)
    assert result.counts.suspect_regions == 2
    assert "2 of 3" in result.layer_warning


def test_plausible_change_is_ok(tmp_path: Path) -> None:
    result = find_hotspots(_planted(tmp_path, variable="RH2M", baselines={}), PRECIP, "both", 10)
    assert {h.quality_flag for h in result.hotspots} == {"ok"}
    assert all(h.warning is None for h in result.hotspots)


def test_temperature_is_not_screened() -> None:
    # Relative change of a degrees-Celsius value is meaningless, so it must not be judged
    grid = Settings().grid_data_dir / "temperature_trend.json"
    result = find_hotspots(grid, LAYER, "both", 5)
    assert {h.quality_flag for h in result.hotspots} == {"not_assessed"}
    assert all(h.relative_change is None for h in result.hotspots)


def test_grid_without_baseline_is_not_assessed(tmp_path: Path) -> None:
    result = find_hotspots(_planted(tmp_path, variable="PRECTOTCORR"), PRECIP, "both", 10)
    assert {h.quality_flag for h in result.hotspots} == {"not_assessed"}


def test_real_precipitation_grid_is_flagged_as_unreliable() -> None:
    # Checked by hand: annual precipitation at these cells rises 1.9x to 3.6x, while a control cell is stable
    grid = Settings().grid_data_dir / "precipitation_trend.json"
    result = find_hotspots(grid, PRECIP, "both", 5)
    assert result.layer_warning is not None
    assert result.counts.suspect_regions / result.counts.regions_after_min_size > 0.5
