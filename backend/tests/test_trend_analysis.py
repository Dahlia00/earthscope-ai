import numpy as np
import pytest
from scipy import stats

from app.models.schemas import AnnualValue, MonthlyObservation
from app.services.trend_analysis import (
    InsufficientDataError,
    analyze_annual_series,
    annual_means,
    interpret,
    trend_columns,
)


def _annual(values: list[float], start: int = 1990) -> list[AnnualValue]:
    return [AnnualValue(year=start + i, mean=v, months_used=12) for i, v in enumerate(values)]


def _monthly(year: int, value: float, months: int = 12) -> list[MonthlyObservation]:
    return [MonthlyObservation(year=year, month=m, value=value) for m in range(1, months + 1)]


def test_annual_means_are_day_weighted() -> None:
    # Feb (28 days) = 0, every other month = 10 -> (337 * 10) / 365
    obs = [MonthlyObservation(year=2001, month=m, value=0.0 if m == 2 else 10.0) for m in range(1, 13)]
    assert annual_means(obs).values[0].mean == pytest.approx(3370 / 365)


def test_annual_means_match_nasa_published_annual_value() -> None:
    # Real NASA POWER T2M for Ottawa 1990; NASA's own annual value (key 199013) is 5.65
    real_1990 = [-7.29, -9.97, -3.43, 5.67, 10.82, 17.39, 20.1, 19.44, 13.07, 7.18, 0.7, -6.89]
    obs = [MonthlyObservation(year=1990, month=m, value=v) for m, v in enumerate(real_1990, start=1)]
    assert annual_means(obs).values[0].mean == pytest.approx(5.65, abs=0.01)


def test_annual_means_drops_incomplete_years_instead_of_averaging_them() -> None:
    obs = _monthly(2000, 10.0) + _monthly(2001, 99.0, months=11) + _monthly(2002, 12.0)
    series = annual_means(obs)
    assert [a.year for a in series.values] == [2000, 2002]
    assert series.incomplete_years == [2001]


def test_exact_linear_trend_recovers_known_slope() -> None:
    # 0.05 C/year is exactly 0.5 C/decade
    stats_ = analyze_annual_series(_annual([10 + 0.05 * i for i in range(36)]))
    assert stats_.slope_per_decade == pytest.approx(0.5)
    assert stats_.ci_lower_per_decade == pytest.approx(0.5)
    assert stats_.ci_upper_per_decade == pytest.approx(0.5)
    assert stats_.significant and stats_.p_value < 1e-10
    assert stats_.mann_kendall_s == 36 * 35 // 2
    assert stats_.trend_line[0].value == pytest.approx(10.0)
    assert stats_.trend_line[-1].value == pytest.approx(10 + 0.05 * 35)


def test_noisy_warming_trend_is_detected_and_ci_contains_truth() -> None:
    rng = np.random.default_rng(42)
    values = 10 + 0.04 * np.arange(36) + rng.normal(0, 0.4, 36)
    result = analyze_annual_series(_annual(list(values)))
    assert result.significant
    assert result.ci_lower_per_decade < 0.4 < result.ci_upper_per_decade
    assert result.ci_lower_per_decade < result.slope_per_decade < result.ci_upper_per_decade


def test_cooling_trend_has_negative_slope() -> None:
    result = analyze_annual_series(_annual([20 - 0.03 * i for i in range(30)]))
    assert result.slope_per_decade == pytest.approx(-0.3)
    assert result.significant


def test_pure_noise_is_not_significant() -> None:
    rng = np.random.default_rng(7)
    result = analyze_annual_series(_annual(list(rng.normal(10, 1, 36))))
    assert not result.significant
    assert result.p_value >= 0.05
    assert result.ci_lower_per_decade < 0 < result.ci_upper_per_decade


def test_constant_series_has_zero_slope_and_p_of_one() -> None:
    result = analyze_annual_series(_annual([5.0] * 20))
    assert result.slope_per_decade == 0
    assert result.p_value == 1.0
    assert not result.significant


def test_too_few_years_raises() -> None:
    with pytest.raises(InsufficientDataError):
        analyze_annual_series(_annual([1.0, 2.0, 3.0]))


def test_matches_scipy_theil_sen_and_kendall_on_series_with_ties() -> None:
    rng = np.random.default_rng(0)
    t = np.arange(1990, 2026, dtype=float)
    for _ in range(25):
        y = np.round(0.02 * (t - 1990) * rng.uniform(-1, 1) + rng.normal(0, 0.8, len(t)), 1)
        ours = trend_columns(t, y[:, None])
        ref = stats.theilslopes(y, t, alpha=0.95)
        assert ours["slope"][0] == pytest.approx(ref.slope)
        # CI interpolates between ranks where scipy rounds to a rank, so allow a small difference
        assert ours["ci_lower"][0] == pytest.approx(ref.low_slope, abs=2e-3)
        assert ours["ci_upper"][0] == pytest.approx(ref.high_slope, abs=2e-3)
        # kendalltau has no continuity correction, so check S and the direction of p instead
        tau = stats.kendalltau(t, y, method="asymptotic")
        assert np.sign(ours["s"][0]) == np.sign(tau.statistic) or tau.statistic == 0
        assert ours["p_value"][0] >= tau.pvalue - 1e-12


def test_worked_mann_kendall_example() -> None:
    # Strictly increasing n=10: S=45, Var(S)=10*9*25/18=125, Z=(45-1)/sqrt(125)
    result = trend_columns(np.arange(10.0), (np.arange(10.0) * 2)[:, None])
    assert result["s"][0] == 45
    assert result["z"][0] == pytest.approx(44 / np.sqrt(125))
    assert result["p_value"][0] == pytest.approx(2 * stats.norm.sf(44 / np.sqrt(125)))


def test_columns_are_independent_and_nan_columns_stay_nan() -> None:
    t = np.arange(20.0)
    y = np.column_stack([t * 0.1, -t * 0.2, np.full(20, np.nan)])
    result = trend_columns(t, y)
    assert result["slope"][0] == pytest.approx(0.1)
    assert result["slope"][1] == pytest.approx(-0.2)
    assert np.isnan(result["slope"][2]) and np.isnan(result["p_value"][2])


def test_interpretation_reports_verified_numbers_only() -> None:
    annual = _annual([10 + 0.05 * i for i in range(36)])
    result = analyze_annual_series(annual)
    text = interpret(result, "Air temperature at 2 m", "C", 1990, 2025, 36)
    assert "increased" in text and "0.50 °C per decade" in text
    assert "statistically significant" in text and "no statistically" not in text


def test_interpretation_for_non_significant_trend_makes_no_trend_claim() -> None:
    rng = np.random.default_rng(7)
    annual = _annual(list(rng.normal(10, 1, 36)))
    result = analyze_annual_series(annual)
    text = interpret(result, "Air temperature at 2 m", "C", 1990, 2025, 36)
    assert "no statistically significant evidence" in text
    assert "increased" not in text and "decreased" not in text


def test_autocorrelated_residuals_are_flagged() -> None:
    rng = np.random.default_rng(3)
    noise = np.zeros(40)
    for i in range(1, 40):
        noise[i] = 0.9 * noise[i - 1] + rng.normal(0, 0.3)
    result = analyze_annual_series(_annual(list(10 + noise)))
    assert result.autocorrelation_flag
    assert "autocorrelated" in interpret(result, "Air temperature at 2 m", "C", 1990, 2029, 40)


def test_interpretation_formats_very_small_p_values() -> None:
    text = interpret(analyze_annual_series(_annual([10 + 0.05 * i for i in range(36)])), "Air temperature at 2 m", "C", 1990, 2025, 36)
    assert "p < 0.0001" in text and "p = <" not in text
