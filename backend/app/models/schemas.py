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
    cell_latitude: float
    cell_longitude: float
    elevation_m: float | None
    observations: list[MonthlyObservation]
    missing_count: int


class AnnualValue(BaseModel):
    year: int
    mean: float
    months_used: int


class TrendPoint(BaseModel):
    year: int
    value: float


class TrendStats(BaseModel):
    method: str
    slope_per_decade: float
    ci_lower_per_decade: float
    ci_upper_per_decade: float
    confidence_level: float
    p_value: float
    significance_level: float
    significant: bool
    mann_kendall_s: int
    mann_kendall_z: float
    lag1_autocorrelation: float
    # True when residual lag-1 autocorrelation is itself significant (|r1| > 1.96/sqrt(n))
    autocorrelation_flag: bool
    trend_line: list[TrendPoint]


class Location(BaseModel):
    requested_latitude: float
    requested_longitude: float
    # Centre of the 0.5 x 0.625 degree MERRA-2 cell the result describes
    cell_latitude: float
    cell_longitude: float
    elevation_m: float | None


class VariableRef(BaseModel):
    id: str
    name: str
    unit: str
    trend_unit: str


class Period(BaseModel):
    requested_start_year: int
    requested_end_year: int
    analyzed_start_year: int
    analyzed_end_year: int


class ObservationCounts(BaseModel):
    monthly_valid: int
    monthly_missing: int
    annual_complete: int
    incomplete_years_excluded: list[int]


class TrendsResponse(BaseModel):
    location: Location
    variable: VariableRef
    source: str
    # "snapshot" means NASA was unreachable and a saved real NASA response was used
    data_origin: Literal["live", "snapshot"]
    retrieved_at: str
    period: Period
    counts: ObservationCounts
    monthly_observations: list[MonthlyObservation]
    annual_values: list[AnnualValue]
    trend: TrendStats
    interpretation: str
    limitations: list[str]


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
