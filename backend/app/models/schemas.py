from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str


class VariableInfo(BaseModel):
    id: str
    name: str
    unit: str
    trend_unit: str
    description: str
    source: str
    coverage_start_year: int
    aggregation: str


class MonthlyObservation(BaseModel):
    year: int
    month: int
    value: float


class MonthlySeries(BaseModel):
    """Validated monthly series parsed from a NASA POWER response."""

    parameter: str
    long_name: str
    unit: str
    source: str
    requested_latitude: float
    requested_longitude: float
    grid_latitude: float
    grid_longitude: float
    elevation_m: float | None
    observations: list[MonthlyObservation]
    missing_count: int


class TileSource(BaseModel):
    """Pre-rendered NASA GIBS tiles the frontend loads directly (display only, no numeric values)."""

    url_template: str  # placeholders: {time} {z} {y} {x}
    projection: str
    time_start: str
    time_period: str  # ISO 8601 duration between available dates
    max_zoom: int


class LayerInfo(BaseModel):
    id: str
    name: str
    category: str
    # trend_grid: numeric per-cell trend computed by us; imagery: GIBS tiles
    kind: Literal["trend_grid", "imagery"]
    status: Literal["available", "not_built", "planned"]
    description: str
    unit: str | None
    trend_unit: str | None
    source: str
    limitations: str
    tiles: TileSource | None = None


class GridAxis(BaseModel):
    start: float
    step: float
    count: int


class TrendGrid(BaseModel):
    """Contract for precomputed global trend files. Arrays are indexed [lat][lon]; null = no valid trend."""

    layer_id: str
    variable: str
    unit: str
    trend_unit: str
    source: str
    method: str
    period_start_year: int
    period_end_year: int
    significance_level: float
    lat: GridAxis
    lon: GridAxis
    slope: list[list[float | None]]
    p_value: list[list[float | None]]
