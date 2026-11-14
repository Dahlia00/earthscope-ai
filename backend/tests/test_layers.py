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


def test_layer_units_agree_with_variable_registry_and_built_grids() -> None:
    from app.config import DEFAULT_GRID_DIR
    from app.services.layers import TREND_LAYER_VARIABLE
    from app.services.variables import VARIABLES

    for layer in LAYERS:
        if layer.kind != "trend_grid":
            continue
        variable = TREND_LAYER_VARIABLE[layer.id]
        if variable in VARIABLES:
            assert (layer.unit, layer.trend_unit) == (VARIABLES[variable].unit, VARIABLES[variable].trend_unit)
        built = DEFAULT_GRID_DIR / f"{layer.id}.json"
        if built.is_file():
            meta = json.loads(built.read_text())
            assert (meta["unit"], meta["trend_unit"]) == (layer.unit, layer.trend_unit), layer.id


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


def _built_gzipped_grid(grid_dir: Path) -> Path:
    from app.services.layers import write_gzip

    grid = TrendGrid(
        layer_id="temperature_trend", variable="T2M", unit="C", trend_unit="C/decade", source="test", method="synthetic",
        period_start_year=2000, period_end_year=2001, significance_level=0.05,
        lat={"start": -90.0, "step": 90.0, "count": 3}, lon={"start": -180.0, "step": 180.0, "count": 2},
        slope=[[0.1, None], [0.2, 0.3], [None, -0.1]], p_value=[[0.01, None], [0.2, 0.04], [None, 0.5]],
    )
    path = grid_dir / "temperature_trend.json"
    path.write_text(grid.model_dump_json())
    write_gzip(path)
    return path


def test_grid_is_served_pre_compressed_to_gzip_clients(grid_dir: Path) -> None:
    _built_gzipped_grid(grid_dir)
    response = client.get("/api/layers/temperature_trend/grid", headers={"Accept-Encoding": "gzip"})
    assert response.status_code == 200
    assert response.headers["content-encoding"] == "gzip"
    assert response.json()["slope"][1] == [0.2, 0.3]


def test_grid_is_served_uncompressed_when_client_does_not_accept_gzip(grid_dir: Path) -> None:
    _built_gzipped_grid(grid_dir)
    response = client.get("/api/layers/temperature_trend/grid", headers={"Accept-Encoding": "identity"})
    assert response.status_code == 200
    assert "content-encoding" not in response.headers
    assert response.json()["slope"][1] == [0.2, 0.3]


def test_grid_has_cache_headers_and_supports_conditional_requests(grid_dir: Path) -> None:
    _built_gzipped_grid(grid_dir)
    first = client.get("/api/layers/temperature_trend/grid")
    assert "max-age=3600" in first.headers["cache-control"]
    etag = first.headers["etag"]
    again = client.get("/api/layers/temperature_trend/grid", headers={"If-None-Match": etag})
    assert again.status_code == 304 and again.content == b""


def test_committed_gzip_files_match_their_json() -> None:
    import gzip

    from app.config import DEFAULT_GRID_DIR
    from app.services.layers import gzip_path

    for json_file in DEFAULT_GRID_DIR.glob("*.json"):
        assert gzip_path(json_file).is_file(), f"missing {gzip_path(json_file).name}; run write_gzip"
        assert gzip.decompress(gzip_path(json_file).read_bytes()) == json_file.read_bytes(), json_file.name
