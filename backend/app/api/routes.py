from fastapi import APIRouter, Depends, HTTPException, Response

from app.config import Settings, get_settings
from app.models.schemas import HealthResponse, LayerInfo
from app.services.layers import get_layer, grid_path, list_layers

router = APIRouter(prefix="/api")


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="EarthScope AI Backend")


@router.get("/layers", response_model=list[LayerInfo])
def layers(settings: Settings = Depends(get_settings)) -> list[LayerInfo]:
    return list_layers(settings.grid_data_dir)


@router.get("/layers/{layer_id}/grid")
def layer_grid(layer_id: str, settings: Settings = Depends(get_settings)) -> Response:
    layer = get_layer(layer_id, settings.grid_data_dir)
    if layer is None:
        raise HTTPException(status_code=404, detail=f"Unknown layer: {layer_id}")
    if layer.kind != "trend_grid":
        raise HTTPException(status_code=404, detail=f"Layer {layer_id} has no numeric grid; use its tiles")
    if layer.status != "available":
        raise HTTPException(status_code=503, detail=f"Trend grid for {layer_id} has not been built yet")
    # Validated against TrendGrid at build time; served as-is to avoid re-parsing ~400k floats
    return Response(grid_path(settings.grid_data_dir, layer_id).read_bytes(), media_type="application/json")
