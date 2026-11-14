import httpx
import pytest

from app.services.nasa_power import NasaPowerError, fetch_monthly_series, parse_monthly_response

# T2M values for Ottawa, 1990-1991, copied from a real NASA POWER response (API v2.10.0).
# Key 199013 is NASA's annual mean. The 199105 value is replaced with the fill value
# to exercise missing-data handling; it is not a real measurement.
PAYLOAD = {
    "geometry": {"type": "Point", "coordinates": [-75.697, 45.422, 123.92]},
    "properties": {
        "parameter": {
            "T2M": {
                "199001": -7.29, "199002": -9.97, "199003": -3.43, "199004": 5.67,
                "199005": 10.82, "199006": 17.39, "199007": 20.1, "199008": 19.44,
                "199009": 13.07, "199010": 7.18, "199011": 0.7, "199012": -6.89,
                "199013": 5.65,
                "199101": -13.17, "199102": -8.56, "199103": -3.16, "199104": 6.69,
                "199105": -999.0, "199106": 18.03,
            }
        }
    },
    "header": {"sources": ["MERRA2"], "fill_value": -999.0},
    "parameters": {"T2M": {"units": "C", "longname": "Temperature at 2 Meters"}},
}


def test_parse_skips_annual_key_and_fill_values() -> None:
    series = parse_monthly_response(PAYLOAD, "T2M", 45.4215, -75.6972)
    assert len(series.observations) == 17
    assert series.missing_count == 1
    assert not any(o.year == 1991 and o.month == 5 for o in series.observations)
    assert all(1 <= o.month <= 12 for o in series.observations)


def test_parse_metadata_and_ordering() -> None:
    series = parse_monthly_response(PAYLOAD, "T2M", 45.4215, -75.6972)
    assert series.unit == "C"
    assert series.long_name == "Temperature at 2 Meters"
    assert series.source == "NASA POWER (MERRA2)"
    assert (series.grid_latitude, series.grid_longitude) == (45.422, -75.697)
    assert series.elevation_m == 123.92
    first, last = series.observations[0], series.observations[-1]
    assert (first.year, first.month, first.value) == (1990, 1, -7.29)
    assert (last.year, last.month, last.value) == (1991, 6, 18.03)


def test_parse_rejects_unexpected_structure() -> None:
    with pytest.raises(NasaPowerError):
        parse_monthly_response({"properties": {}}, "T2M", 0, 0)


def test_parse_rejects_malformed_time_key() -> None:
    bad = {**PAYLOAD, "properties": {"parameter": {"T2M": {"1990-01": 1.0}}}}
    with pytest.raises(NasaPowerError):
        parse_monthly_response(bad, "T2M", 0, 0)


def _client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_fetch_sends_expected_query() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(request.url.params)
        return httpx.Response(200, json=PAYLOAD)

    fetch_monthly_series(45.4215, -75.6972, "T2M", 1990, 1991, client=_client(handler))
    assert seen["parameters"] == "T2M"
    assert seen["community"] == "RE"
    assert seen["start"] == "1990" and seen["end"] == "1991"
    assert seen["latitude"] == "45.4215" and seen["longitude"] == "-75.6972"


def test_fetch_raises_on_http_error() -> None:
    client = _client(lambda request: httpx.Response(503))
    with pytest.raises(NasaPowerError, match="503"):
        fetch_monthly_series(0, 0, "T2M", 1990, 1991, client=client)


def test_fetch_raises_on_timeout() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timeout", request=request)

    with pytest.raises(NasaPowerError, match="timed out"):
        fetch_monthly_series(0, 0, "T2M", 1990, 1991, client=_client(handler))


@pytest.mark.live
def test_live_ottawa_t2m() -> None:
    series = fetch_monthly_series(45.4215, -75.6972, "T2M", 1990, 2025)
    assert series.unit == "C"
    assert len(series.observations) + series.missing_count == 36 * 12
    assert series.observations[0].year == 1990
    assert -40 < min(o.value for o in series.observations) < max(o.value for o in series.observations) < 40
