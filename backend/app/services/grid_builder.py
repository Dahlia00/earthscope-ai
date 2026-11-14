"""Build a global trend grid for a globe layer from the NASA POWER MERRA-2 monthly Zarr store.

Run once, commit the output:  python -m app.services.grid_builder temperature_trend [start_year] [end_year]

Per cell: day-weighted annual means (same rule as /api/trends), then Theil-Sen slope and Mann-Kendall p-value
via trend_analysis.trend_columns. A cell with any missing or out-of-range month in the period is null,
never interpolated.
"""

import calendar
import sys
from datetime import datetime, timezone

import fsspec
import numpy as np
import pandas as pd
import xarray as xr

from app.config import get_settings
from app.models.schemas import GridAxis, TrendGrid
from app.services.layers import TREND_LAYER_VARIABLE, get_layer, grid_path
from app.services.trend_analysis import MIN_YEARS, SIGNIFICANCE_LEVEL, trend_columns

ZARR_URL = "https://nasa-power.s3.us-west-2.amazonaws.com/merra2/temporal/power_merra2_monthly_temporal_lst.zarr"
DEFAULT_START_YEAR = 1981
LAT_BAND = 30  # matches the Zarr spatial chunk size
COLUMN_CHUNK = 5000
METHOD = (
    "Theil-Sen slope per decade on day-weighted annual means; Mann-Kendall p-value "
    "(tie-corrected, continuity-corrected, two-sided). Cells with any missing month are null."
)


def annual_from_monthly(monthly: np.ndarray, years: list[int]) -> np.ndarray:
    """(n_years*12, cells) monthly values -> (n_years, cells) day-weighted annual means; NaN propagates."""
    n = len(years)
    days = np.array([[calendar.monthrange(y, m)[1] for m in range(1, 13)] for y in years], dtype=float)[:, :, None]
    cells = monthly.reshape(n, 12, -1)
    return (cells * days).sum(axis=1) / days.sum(axis=1)


def trends_for_cells(monthly: np.ndarray, years: list[int]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return (slope per decade, p-value, period mean of annual values), each shape (cells,)."""
    annual = annual_from_monthly(monthly, years)
    t = np.array(years, dtype=float)
    slope = np.empty(annual.shape[1])
    p_value = np.empty(annual.shape[1])
    for a in range(0, annual.shape[1], COLUMN_CHUNK):
        r = trend_columns(t, annual[:, a : a + COLUMN_CHUNK])
        slope[a : a + COLUMN_CHUNK] = r["slope"] * 10
        p_value[a : a + COLUMN_CHUNK] = r["p_value"]
    return slope, p_value, annual.mean(axis=0)


def _axis(values: np.ndarray) -> GridAxis:
    steps = np.diff(values)
    if not np.allclose(steps, steps[0]):
        raise ValueError("Grid axis is not evenly spaced")
    return GridAxis(start=float(values[0]), step=float(steps[0]), count=len(values))


def _to_lists(a: np.ndarray, digits: int) -> list[list[float | None]]:
    rounded = np.round(a, digits)
    return [[None if np.isnan(v) else float(v) for v in row] for row in rounded]


def build_grid(layer_id: str, start_year: int = DEFAULT_START_YEAR, end_year: int | None = None):
    settings = get_settings()
    layer = get_layer(layer_id, settings.grid_data_dir)
    if layer is None or layer_id not in TREND_LAYER_VARIABLE:
        raise ValueError(f"{layer_id!r} is not a trend_grid layer")
    variable = TREND_LAYER_VARIABLE[layer_id]
    end_year = end_year or datetime.now(timezone.utc).year - 1
    years = list(range(start_year, end_year + 1))
    if len(years) < MIN_YEARS:
        raise ValueError(f"Need at least {MIN_YEARS} years")

    ds = xr.open_zarr(fsspec.get_mapper(ZARR_URL), consolidated=True)
    da = ds[variable]
    if da.attrs.get("units") != layer.unit:
        raise ValueError(f"{variable} units are {da.attrs.get('units')!r}, registry says {layer.unit!r}")
    da = da.sel(time=slice(f"{start_year}-01-01", f"{end_year}-12-31"))

    months = pd.DatetimeIndex(da.time.values)
    expected = pd.MultiIndex.from_product([years, range(1, 13)])
    if not pd.MultiIndex.from_arrays([months.year, months.month]).equals(expected):
        raise ValueError(f"Zarr time axis does not hold exactly 12 months for each of {start_year}-{end_year}")

    lat_axis, lon_axis = _axis(da.lat.values), _axis(da.lon.values)
    n_lat, n_lon = lat_axis.count, lon_axis.count
    lo, hi = da.attrs.get("valid_min"), da.attrs.get("valid_max")
    slope = np.full((n_lat, n_lon), np.nan)
    p_value = np.full((n_lat, n_lon), np.nan)
    baseline = np.full((n_lat, n_lon), np.nan)

    for a in range(0, n_lat, LAT_BAND):
        band = da.isel(lat=slice(a, a + LAT_BAND)).values.astype(float)  # (time, lat, lon)
        if lo is not None and hi is not None:
            band = np.where((band >= lo) & (band <= hi), band, np.nan)
        s, p, b = trends_for_cells(band.reshape(band.shape[0], -1), years)
        slope[a : a + band.shape[1]] = s.reshape(band.shape[1], n_lon)
        p_value[a : a + band.shape[1]] = p.reshape(band.shape[1], n_lon)
        baseline[a : a + band.shape[1]] = b.reshape(band.shape[1], n_lon)
        print(f"  lat rows {a}-{a + band.shape[1] - 1} done", flush=True)

    if np.isnan(slope).all():
        raise ValueError("No valid cells: refusing to write an empty grid")

    grid = TrendGrid(
        layer_id=layer_id,
        variable=variable,
        unit=layer.unit,
        trend_unit=layer.trend_unit,
        source=f"{layer.source}; retrieved {datetime.now(timezone.utc).date().isoformat()}",
        method=METHOD,
        period_start_year=start_year,
        period_end_year=end_year,
        significance_level=SIGNIFICANCE_LEVEL,
        lat=lat_axis,
        lon=lon_axis,
        slope=_to_lists(slope, 3),
        p_value=_to_lists(p_value, 4),
        baseline=_to_lists(baseline, 2),
    )
    path = grid_path(settings.grid_data_dir, layer_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(grid.model_dump_json())
    return path, int(np.isnan(slope).sum()), slope.size


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        raise SystemExit("usage: python -m app.services.grid_builder <layer_id> [start_year] [end_year]")
    out, null_cells, total = build_grid(args[0], *(int(a) for a in args[1:3]))
    print(f"wrote {out} ({total - null_cells}/{total} cells with a trend)")
