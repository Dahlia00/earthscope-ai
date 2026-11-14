from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from app.config import Settings, get_settings
from app.models.schemas import HealthResponse, HotspotsResponse, LayerInfo, TrendsResponse, VariableInfo
from app.services import nasa_power
from app.services.detective import find_hotspots
from app.services.layers import get_layer, grid_path, gzip_path, list_layers
from app.services.nasa_power import NasaPowerError
from app.services.snapshots import load_snapshot
from app.services.trend_analysis import InsufficientDataError
from app.services.trends import build_trends_response
from app.services.variables import VARIABLES

router = APIRouter(prefix="/api")


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="EarthScope AI Backend")


@router.get("/variables", response_model=list[VariableInfo])
def variables() -> list[VariableInfo]:
    return list(VARIABLES.values())


@router.get("/trends", response_model=TrendsResponse)
def trends(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    variable: str = Query(...),
    start_year: int = Query(...),
    end_year: int = Query(...),
    settings: Settings = Depends(get_settings),
) -> TrendsResponse:
    info = VARIABLES.get(variable)
    if info is None:
        raise HTTPException(422, f"Unsupported variable {variable!r}. Supported: {', '.join(VARIABLES)}")
    this_year = datetime.now(timezone.utc).year
    if start_year < info.coverage_start_year:
        raise HTTPException(422, f"start_year must be {info.coverage_start_year} or later for {variable}")
    if end_year > this_year:
        raise HTTPException(422, f"end_year cannot be after {this_year}")
    if start_year > end_year:
        raise HTTPException(422, "start_year must not be after end_year")

    data_origin = "live"
    retrieved_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        series = nasa_power.fetch_monthly_series(latitude, longitude, variable, start_year, end_year)
    except NasaPowerError as exc:
        # Only an exact-match saved copy of a real NASA response is used, and it is labelled as such
        saved = load_snapshot(settings.snapshot_dir, latitude, longitude, variable, start_year, end_year)
        if saved is None:
            raise HTTPException(502, f"Could not retrieve data from NASA POWER: {exc}") from exc
        series, retrieved_at = saved
        data_origin = "snapshot"
    try:
        return build_trends_response(series, info, start_year, end_year, data_origin, retrieved_at)
    except InsufficientDataError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/layers", response_model=list[LayerInfo])
def layers(settings: Settings = Depends(get_settings)) -> list[LayerInfo]:
    return list_layers(settings.grid_data_dir)


def _built_grid_layer(layer_id: str, settings: Settings) -> LayerInfo:
    layer = get_layer(layer_id, settings.grid_data_dir)
    if layer is None:
        raise HTTPException(status_code=404, detail=f"Unknown layer: {layer_id}")
    if layer.kind != "trend_grid":
        raise HTTPException(status_code=404, detail=f"Layer {layer_id} has no numeric grid; use its tiles")
    if layer.status != "available":
        raise HTTPException(status_code=503, detail=f"Trend grid for {layer_id} has not been built yet")
    return layer


@router.get("/layers/{layer_id}/grid")
def layer_grid(
    layer_id: str, request: Request, settings: Settings = Depends(get_settings)
) -> Response:
    _built_grid_layer(layer_id, settings)
    path = grid_path(settings.grid_data_dir, layer_id)
    stat = path.stat()
    etag = f'W/"{stat.st_mtime_ns}-{stat.st_size}"'
    headers = {"Cache-Control": "public, max-age=3600", "ETag": etag, "Vary": "Accept-Encoding"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)

    # Validated against TrendGrid at build time; served as-is, pre-compressed when the client accepts gzip
    gz = gzip_path(path)
    if "gzip" in request.headers.get("accept-encoding", "") and gz.is_file():
        return Response(
            gz.read_bytes(), media_type="application/json", headers={**headers, "Content-Encoding": "gzip"}
        )
    return Response(path.read_bytes(), media_type="application/json", headers=headers)


@router.get("/detective/hotspots", response_model=HotspotsResponse)
def hotspots(
    layer_id: str = Query(...),
    direction: Literal["increase", "decrease", "both"] = "both",
    limit: int = Query(10, ge=1, le=50),
    settings: Settings = Depends(get_settings),
) -> HotspotsResponse:
    layer = _built_grid_layer(layer_id, settings)
    return find_hotspots(grid_path(settings.grid_data_dir, layer_id), layer, direction, limit)
