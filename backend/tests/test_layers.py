import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from app.models.schemas import TrendGrid
from app.services.layers import LAYERS

client = TestClient(app)


@pytest.fixture
def grid_dir(tmp_path: Path):
    app.dependency_overrides[get_settings] = lambda: Settings(grid_data_dir=tmp_path)
    yield tmp_path
    app.dependency_overrides.clear()


def _layer(layers: list[dict], layer_id: str) -> dict:
    return next(layer for layer in layers if layer["id"] == layer_id)


def test_registry_ids_unique() -> None:
    ids = [layer.id for layer in LAYERS]
    assert len(ids) == len(set(ids))


def test_imagery_layers_have_complete_tile_templates() -> None:
    for layer in LAYERS:
        if layer.kind == "imagery" and layer.status == "available":
            assert layer.tiles is not None
            for placeholder in ("{time}", "{z}", "{y}", "{x}"):
                assert placeholder in layer.tiles.url_template


def test_layers_status_when_nothing_built(grid_dir: Path) -> None:
    layers = client.get("/api/layers").json()
    assert _layer(layers, "temperature_trend")["status"] == "not_built"
    assert _layer(layers, "vegetation_evi")["status"] == "available"
    assert _layer(layers, "forest_loss")["status"] == "planned"


def test_grid_not_built_returns_503_not_fake_data(grid_dir: Path) -> None:
    response = client.get("/api/layers/temperature_trend/grid")
    assert response.status_code == 503


def test_grid_unknown_layer_404(grid_dir: Path) -> None:
    assert client.get("/api/layers/../../etc/passwd/grid").status_code == 404
    assert client.get("/api/layers/nope/grid").status_code == 404


def test_grid_for_imagery_layer_404(grid_dir: Path) -> None:
    assert client.get("/api/layers/vegetation_evi/grid").status_code == 404


def test_built_grid_is_served_and_marked_available(grid_dir: Path) -> None:
    grid = TrendGrid(
        layer_id="temperature_trend",
        variable="T2M",
        unit="C",
        trend_unit="C/decade",
        source="test fixture",
        method="synthetic",
        period_start_year=2000,
        period_end_year=2001,
        significance_level=0.05,
        lat={"start": -90.0, "step": 90.0, "count": 3},
        lon={"start": -180.0, "step": 180.0, "count": 2},
        slope=[[0.1, None], [0.2, 0.3], [None, -0.1]],
        p_value=[[0.01, None], [0.2, 0.04], [None, 0.5]],
    )
    (grid_dir / "temperature_trend.json").write_text(grid.model_dump_json())

    layers = client.get("/api/layers").json()
    assert _layer(layers, "temperature_trend")["status"] == "available"

    response = client.get("/api/layers/temperature_trend/grid")
    assert response.status_code == 200
    body = response.json()
    assert body["slope"][1] == [0.2, 0.3]
    assert body["slope"][0][1] is None
    TrendGrid.model_validate(body)


@pytest.mark.live
@pytest.mark.parametrize("layer_id", ["vegetation_evi", "ocean_chlorophyll"])
def test_live_gibs_tile_template_resolves(layer_id: str) -> None:
    layer = next(layer for layer in LAYERS if layer.id == layer_id)
    url = layer.tiles.url_template.format(time=layer.tiles.time_start, z=2, y=1, x=1)
    response = httpx.get(url, timeout=30)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
