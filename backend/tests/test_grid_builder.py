import numpy as np
import pytest

from app.models.schemas import MonthlyObservation
from app.services.grid_builder import annual_from_monthly, trends_for_cells
from app.services.trend_analysis import annual_means

YEARS = list(range(2000, 2020))


def _monthly(per_year_slopes: list[float], base: float = 10.0) -> np.ndarray:
    """(years*12, cells): every month of year y equals base + slope*(y - 2000)."""
    cols = [np.repeat(base + s * np.array([y - 2000 for y in YEARS], dtype=float), 12) for s in per_year_slopes]
    return np.column_stack(cols)


def test_known_slopes_recovered_per_cell() -> None:
    slope, p = trends_for_cells(_monthly([0.05, -0.02, 0.0]), YEARS)
    assert slope[0] == pytest.approx(0.5)
    assert slope[1] == pytest.approx(-0.2)
    assert slope[2] == pytest.approx(0.0)
    assert p[0] < 1e-4 and p[1] < 1e-2 and p[2] == 1.0


def test_cell_with_a_missing_month_is_nan_not_a_partial_trend() -> None:
    monthly = _monthly([0.05, 0.05])
    monthly[37, 1] = np.nan
    slope, p = trends_for_cells(monthly, YEARS)
    assert slope[0] == pytest.approx(0.5)
    assert np.isnan(slope[1]) and np.isnan(p[1])


def test_grid_annual_means_agree_with_point_endpoint_logic() -> None:
    rng = np.random.default_rng(1)
    monthly = rng.normal(10, 5, size=(len(YEARS) * 12, 1))
    grid_annual = annual_from_monthly(monthly, YEARS)[:, 0]
    obs = [
        MonthlyObservation(year=y, month=m, value=float(monthly[i * 12 + m - 1, 0]))
        for i, y in enumerate(YEARS)
        for m in range(1, 13)
    ]
    point_annual = [a.mean for a in annual_means(obs).values]
    assert grid_annual == pytest.approx(point_annual)
