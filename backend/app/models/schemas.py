from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str


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
