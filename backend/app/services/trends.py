from app.models.schemas import (
    Location,
    MonthlySeries,
    ObservationCounts,
    Period,
    TrendsResponse,
    VariableInfo,
    VariableRef,
)
from app.services.trend_analysis import LIMITATIONS, analyze_annual_series, annual_means, interpret


def build_trends_response(
    series: MonthlySeries,
    variable: VariableInfo,
    start_year: int,
    end_year: int,
    data_origin: str,
    retrieved_at: str,
) -> TrendsResponse:
    """Raises InsufficientDataError when there are too few complete years."""
    annual = annual_means(series.observations)
    trend = analyze_annual_series(annual.values)
    first, last = annual.values[0].year, annual.values[-1].year
    return TrendsResponse(
        location=Location(
            requested_latitude=series.requested_latitude,
            requested_longitude=series.requested_longitude,
            cell_latitude=series.cell_latitude,
            cell_longitude=series.cell_longitude,
            elevation_m=series.elevation_m,
        ),
        variable=VariableRef(id=variable.id, name=variable.name, unit=series.unit),
        source=series.source,
        data_origin=data_origin,
        retrieved_at=retrieved_at,
        period=Period(
            requested_start_year=start_year,
            requested_end_year=end_year,
            analyzed_start_year=first,
            analyzed_end_year=last,
        ),
        counts=ObservationCounts(
            monthly_valid=len(series.observations),
            monthly_missing=series.missing_count,
            annual_complete=len(annual.values),
            incomplete_years_excluded=annual.incomplete_years,
        ),
        monthly_observations=series.observations,
        annual_values=annual.values,
        trend=trend,
        interpretation=interpret(trend, variable.name, series.unit, first, last, len(annual.values)),
        limitations=LIMITATIONS,
    )
