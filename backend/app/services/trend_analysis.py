"""Trend statistics: Theil-Sen slope, Mann-Kendall test and Sen's confidence interval.

Method (Gilbert 1987, Statistical Methods for Environmental Pollution Monitoring):
  slope      median of all pairwise slopes (y_j - y_i) / (t_j - t_i)
  test       Mann-Kendall S with tie-corrected variance and continuity correction, two-sided
  interval   Sen's non-parametric CI from the Mann-Kendall variance, by rank in the sorted pairwise slopes
`trend_columns` works on many series at once so the globe grids and /api/trends share one implementation.
Assumes independent values; autocorrelation makes p-values too small (lag-1 is reported as a diagnostic).
"""

import calendar
import math
from dataclasses import dataclass

import numpy as np
from scipy.stats import norm

from app.models.schemas import AnnualValue, MonthlyObservation, TrendPoint, TrendStats

MIN_YEARS = 10
SIGNIFICANCE_LEVEL = 0.05
CONFIDENCE_LEVEL = 0.95

LIMITATIONS = [
    "Statistical significance does not prove causation.",
    "Result is for one MERRA-2 grid cell (about 0.5 x 0.625 degrees); it does not represent a country or region.",
    "MERRA-2 is a model-assimilated reanalysis, not direct station observations.",
    "The Mann-Kendall test assumes independent annual values; positive autocorrelation makes p-values too small.",
    "Years with any missing month are excluded from the annual series.",
]


class InsufficientDataError(ValueError):
    """Too few complete years to estimate a trend."""


@dataclass(frozen=True)
class AnnualSeries:
    values: list[AnnualValue]
    incomplete_years: list[int]


def annual_means(observations: list[MonthlyObservation]) -> AnnualSeries:
    """Day-weighted mean of 12 monthly values per year (matches NASA's own annual value to within rounding).

    Years with any missing month are dropped, not averaged.
    """
    by_year: dict[int, dict[int, float]] = {}
    for obs in observations:
        by_year.setdefault(obs.year, {})[obs.month] = obs.value
    complete = []
    for year, months in sorted(by_year.items()):
        if len(months) == 12:
            days = {m: calendar.monthrange(year, m)[1] for m in months}
            mean = sum(months[m] * days[m] for m in months) / sum(days.values())
            complete.append(AnnualValue(year=year, mean=mean, months_used=12))
    incomplete = sorted(y for y, months in by_year.items() if len(months) != 12)
    return AnnualSeries(values=complete, incomplete_years=incomplete)


def trend_columns(t: np.ndarray, y: np.ndarray, confidence: float = CONFIDENCE_LEVEL) -> dict[str, np.ndarray]:
    """Trend of each column of y (shape n x m) against t (shape n). Columns with non-finite values give NaN."""
    n, m = y.shape
    valid = np.isfinite(y).all(axis=0)
    y = np.where(valid, y, 0.0)

    i, j = np.triu_indices(n, 1)
    diff = y[j] - y[i]
    slopes = np.sort(diff / (t[j] - t[i])[:, None], axis=0)
    n_pairs = slopes.shape[0]

    s = np.sign(diff).sum(axis=0)
    # Each element of a tie group of size g contributes (g-1)(2g+5), so the group total is g(g-1)(2g+5).
    group = (y[:, None, :] == y[None, :, :]).sum(axis=1)
    var_s = (n * (n - 1) * (2 * n + 5) - ((group - 1) * (2 * group + 5)).sum(axis=0)) / 18

    with np.errstate(divide="ignore", invalid="ignore"):
        z = np.where(var_s > 0, (s - np.sign(s)) / np.sqrt(var_s), 0.0)
    p_value = 2 * norm.sf(np.abs(z))

    slope = np.median(slopes, axis=0)
    intercept = np.median(y - slope * t[:, None], axis=0)

    c = norm.ppf(1 - (1 - confidence) / 2) * np.sqrt(np.maximum(var_s, 0))
    lower = _slope_at_rank(slopes, (n_pairs - c) / 2 - 1)
    upper = _slope_at_rank(slopes, (n_pairs + c) / 2)

    out = {"slope": slope, "intercept": intercept, "ci_lower": lower, "ci_upper": upper, "s": s, "z": z, "p_value": p_value}
    for name, arr in out.items():
        out[name] = np.where(valid, arr.astype(float), np.nan)
    return out


def _slope_at_rank(sorted_slopes: np.ndarray, rank: np.ndarray) -> np.ndarray:
    """Linear interpolation at fractional 0-based ranks (one per column) of column-sorted slopes."""
    rank = np.clip(rank, 0, sorted_slopes.shape[0] - 1)
    lo = np.floor(rank).astype(int)
    hi = np.minimum(lo + 1, sorted_slopes.shape[0] - 1)
    frac = rank - lo
    a = np.take_along_axis(sorted_slopes, lo[None, :], axis=0)[0]
    b = np.take_along_axis(sorted_slopes, hi[None, :], axis=0)[0]
    return a + (b - a) * frac


def analyze_annual_series(annual: list[AnnualValue]) -> TrendStats:
    if len(annual) < MIN_YEARS:
        raise InsufficientDataError(
            f"Only {len(annual)} complete years of data; at least {MIN_YEARS} are needed to estimate a trend."
        )
    t = np.array([a.year for a in annual], dtype=float)
    y = np.array([a.mean for a in annual], dtype=float)
    r = trend_columns(t, y[:, None])
    slope, intercept = float(r["slope"][0]), float(r["intercept"][0])
    p_value = float(r["p_value"][0])

    residuals = y - (slope * t + intercept)
    r1 = _lag1_autocorrelation(residuals)
    return TrendStats(
        method="Theil-Sen slope; Mann-Kendall test (tie-corrected, two-sided); Sen confidence interval",
        slope_per_decade=slope * 10,
        ci_lower_per_decade=float(r["ci_lower"][0]) * 10,
        ci_upper_per_decade=float(r["ci_upper"][0]) * 10,
        confidence_level=CONFIDENCE_LEVEL,
        p_value=p_value,
        significance_level=SIGNIFICANCE_LEVEL,
        significant=p_value < SIGNIFICANCE_LEVEL,
        mann_kendall_s=int(r["s"][0]),
        mann_kendall_z=float(r["z"][0]),
        lag1_autocorrelation=r1,
        autocorrelation_flag=abs(r1) > 1.96 / math.sqrt(len(y)),
        trend_line=[TrendPoint(year=int(a.year), value=float(slope * a.year + intercept)) for a in annual],
    )


def _lag1_autocorrelation(residuals: np.ndarray) -> float:
    d = residuals - residuals.mean()
    denom = float((d**2).sum())
    return float((d[:-1] * d[1:]).sum() / denom) if denom > 0 else 0.0


def interpret(stats: TrendStats, variable_name: str, unit: str, first_year: int, last_year: int, n_years: int) -> str:
    label = "°C" if unit == "C" else unit
    lo, hi = stats.ci_lower_per_decade, stats.ci_upper_per_decade
    span_change = stats.slope_per_decade * (last_year - first_year) / 10
    ci = f"95% CI {lo:+.2f} to {hi:+.2f} {label} per decade"
    if stats.significant:
        direction = "increased" if stats.slope_per_decade > 0 else "decreased"
        text = (
            f"From {first_year} to {last_year} ({n_years} complete years), annual mean {variable_name.lower()} at this "
            f"location {direction} by an estimated {abs(stats.slope_per_decade):.2f} {label} per decade ({ci}), "
            f"about {span_change:+.2f} {label} over the period. The Mann-Kendall test gives p = {_fmt_p(stats.p_value)}, "
            f"below {stats.significance_level}, so the trend is statistically significant."
        )
    else:
        text = (
            f"From {first_year} to {last_year} ({n_years} complete years), the estimated change in annual mean "
            f"{variable_name.lower()} at this location is {stats.slope_per_decade:+.2f} {label} per decade ({ci}). "
            f"The Mann-Kendall test gives p = {_fmt_p(stats.p_value)}, not below {stats.significance_level}, so "
            f"there is no statistically significant evidence of a trend."
        )
    if stats.autocorrelation_flag:
        text += (
            f" Year-to-year values are autocorrelated (lag-1 r = {stats.lag1_autocorrelation:.2f}), "
            "so the p-value may overstate significance."
        )
    return text


def _fmt_p(p: float) -> str:
    return "<0.0001" if p < 1e-4 else f"{p:.4f}"
