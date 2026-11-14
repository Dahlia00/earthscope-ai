"""Supported variables for point trends. Only add one after checking POWER coverage and units."""

from app.models.schemas import VariableInfo

# Definition text comes from the POWER dataset metadata; coverage from the MERRA-2 monthly store (starts 1981-01).
VARIABLES: dict[str, VariableInfo] = {
    "T2M": VariableInfo(
        id="T2M",
        name="Air temperature at 2 m",
        unit="C",
        trend_unit="C/decade",
        description="The average air (dry bulb) temperature at 2 meters above the surface of the earth.",
        source="NASA POWER, MERRA-2 reanalysis (monthly)",
        coverage_start_year=1981,
        aggregation="Annual mean of the 12 monthly values; years with any missing month are excluded.",
    ),
}
