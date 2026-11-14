# EarthScope AI Backend

FastAPI backend for EarthScope AI (NASA Space Apps 2026, "Be an Earth System Trend Detective!").

## Setup (Python 3.11+)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # optional
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs

## Test

```bash
pytest              # offline tests (NASA calls mocked)
pytest -m live      # also hits the real NASA POWER API
```

## Inspect real NASA data (Ottawa, T2M, 1990-2025)

```bash
python -m app.services.nasa_power
```

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Liveness check |
| `GET /api/variables` | Supported variables, units, descriptions, coverage |
| `GET /api/trends` | Point trend analysis (below) |
| `GET /api/layers` | Registry of globe overlays |
| `GET /api/layers/{id}/grid` | Prebuilt global trend grid (404 unknown or imagery layer, 503 not built) |
| `GET /api/detective/hotspots` | Earth Detective Mode: strongest trend regions in a built grid (below) |

### GET /api/trends

```
GET /api/trends?latitude=45.4215&longitude=-75.6972&variable=T2M&start_year=1990&end_year=2025
```

All five parameters are required. `latitude` -90..90, `longitude` -180..180, `variable` from `/api/variables`,
`start_year` >= the variable's `coverage_start_year` (1981), `end_year` not in the future, start <= end.

Supported `variable` values (all NASA POWER monthly, MERRA-2, 1981 onward; checked against the live API):

| id | Unit | Trend unit |
| --- | --- | --- |
| `T2M` | C | C/decade |
| `PRECTOTCORR` | mm/day | mm/day/decade |
| `RH2M` | % | percentage points/decade (an absolute change, not a relative one) |

| Status | Meaning |
| --- | --- |
| 200 | Result (shape below) |
| 422 | Invalid parameter, or fewer than 10 complete years (no trend is computed) |
| 502 | NASA POWER unreachable and no saved snapshot for this exact request |

The full real response for Ottawa is in `sample_responses/trends_ottawa_t2m_1990_2025.json`. Abridged:

```json
{
  "location": {"requested_latitude": 45.4215, "requested_longitude": -75.6972, "cell_latitude": 45.5, "cell_longitude": -75.625, "elevation_m": 123.92},
  "variable": {"id": "T2M", "name": "Air temperature at 2 m", "unit": "C", "trend_unit": "C/decade"},
  "source": "NASA POWER (MERRA2)",
  "data_origin": "live",
  "retrieved_at": "2026-11-14T17:20:22+00:00",
  "period": {"requested_start_year": 1990, "requested_end_year": 2025, "analyzed_start_year": 1990, "analyzed_end_year": 2025},
  "counts": {"monthly_valid": 432, "monthly_missing": 0, "annual_complete": 36, "incomplete_years_excluded": []},
  "monthly_observations": [{"year": 1990, "month": 1, "value": -7.29}, "..."],
  "annual_values": [{"year": 1990, "mean": 5.6536, "months_used": 12}, "..."],
  "trend": {
    "slope_per_decade": 0.501, "ci_lower_per_decade": 0.209, "ci_upper_per_decade": 0.752,
    "confidence_level": 0.95, "p_value": 0.0029, "significance_level": 0.05, "significant": true,
    "lag1_autocorrelation": 0.134, "autocorrelation_flag": false,
    "trend_line": [{"year": 1990, "value": 4.5736}, "..."]
  },
  "interpretation": "From 1990 to 2025 (36 complete years), annual mean air temperature ...",
  "limitations": ["Statistical significance does not prove causation.", "..."]
}
```

The frontend should chart `monthly_observations`, `annual_values` and `trend.trend_line` as given and display
`trend`, `interpretation` and `limitations` verbatim. It does not need to compute any statistics.
`data_origin: "snapshot"` means NASA was unreachable and a saved real response was used; show `retrieved_at`.

## Method (point trends)

1. Fetch monthly values from NASA POWER; drop `-999` fill values.
2. Annual mean = day-weighted mean of 12 months (matches NASA's own annual value to within 0.01 C). Years with any
   missing month are excluded, never averaged. Monthly values are not treated as independent samples.
3. Slope: Theil-Sen (median of pairwise slopes), reported per decade.
4. Significance: Mann-Kendall with tie correction and continuity correction, two-sided; `significant` means p < 0.05.
5. 95% CI: Sen's interval from the Mann-Kendall variance (Gilbert 1987), consistent with the slope estimator.
6. Needs at least 10 complete years. `lag1_autocorrelation` of the detrended series is reported, and
   `autocorrelation_flag` is set when it is itself significant (|r1| > 1.96/sqrt(n)); p-values are then optimistic.

The code is cross-checked in the tests against `scipy.stats.theilslopes` and `kendalltau`. The interpretation text is
generated from these numbers by fixed templates; nothing is estimated by a language model.

Limitations: one MERRA-2 cell (0.5 x 0.625 deg) does not represent a country or region; MERRA-2 is a model-assimilated
reanalysis, not station data; significance does not prove causation.

## Earth Detective Mode

```
GET /api/detective/hotspots?layer_id=temperature_trend&direction=both&limit=10
```

Finds regions with the strongest statistically supported trends in a built grid, so users can start from a lead
instead of a coordinate. `layer_id` is a `trend_grid` layer; `direction` is `increase`, `decrease` or `both`
(default); `limit` 1..50 (default 10). 404 for unknown or imagery layers, 503 if the grid is not built.

1. Benjamini-Hochberg FDR (q = 0.05) across all ~208,000 cells. A raw 5% test would flag about 10,000 by chance.
2. Keep FDR-significant cells in the top 2% by |slope| (ranking by p-value alone is useless: it is ~0 almost everywhere).
3. Merge adjacent same-sign cells into regions, wrapping across the antimeridian. Regions under 6 cells are dropped.
4. Rank by cluster mass, |area-weighted mean slope| x area, so large coherent signals beat tiny extreme patches.

Each hotspot has `mean_slope`, `total_change`, `area_km2`, `n_cells`, `peak` cell, `centroid`, `bounds`
(`crosses_antimeridian` when west > east), a `description`, and a `drilldown` point. Pass `drilldown` to
`/api/trends` (same variable, the response's `period_start_year` / `period_end_year`) for the full analysis of that location.
`counts` and `parameters` show how many cells survived each step. Example: `sample_responses/hotspots_temperature_trend.json`.
For `temperature_trend` the top hotspot is 1,714 cells (about 1.3 million km²) at lat 70-84, lon 10-92, +1.00 C/decade.

### Data-quality flags (show these in the UI)

5. For precipitation, humidity and temperature range, each hotspot's `total_change` is compared with its local period
   mean (`baseline_mean`). If the change exceeds 50% of the mean, `quality_flag` is `suspect_magnitude`, `warning`
   explains why, and the hotspot is ranked after every unflagged one. Temperature (degrees C) has no meaningful relative
   change, so it is `not_assessed`. Otherwise `ok`.
6. If at least half of a layer's regions are flagged, `layer_warning` is set. **Precipitation currently triggers this
   (23 of 24 regions).** In the top cells, annual precipitation rises 1.9x to 3.6x between the first and last decade, while a
   control cell (Ottawa) is flat. That is not a credible climate signal, so treat the precipitation layer as unreliable.
   The cause is unconfirmed. Humidity and temperature range pass the check.

`/api/trends` applies the same check and returns `warnings` (a list, empty when none apply); show them next to the result.
Samples: `sample_responses/hotspots_precipitation_trend_flagged.json`.

Regions have coordinates only; there are no place names. Hotspots are leads, not findings: MERRA-2 trends, especially
precipitation and humidity, can be affected by changes in assimilated observing systems, and neighbouring cells are not
independent. The response repeats this in `limitations`.

## Deploy (Render)

`requirements-prod.txt` holds only what the API needs; `requirements.txt` adds the offline grid builder and tests.
`Dockerfile` runs the API as a non-root user on `$PORT`. The grids and the Ottawa snapshot are baked into the image.
Tested locally under a 512 MB memory limit: about 110 MB in use, so the free instance size is enough.

Render settings (also in `render.yaml` at the repo root): runtime Docker, branch `main`, Dockerfile path
`./backend/Dockerfile`, build context `./backend`, health check path `/api/health`.
Set `EXTRA_CORS_ORIGINS` to the deployed frontend origin (no trailing slash; comma-separate several; no wildcards).
After deploy, the frontend should use the service URL (`https://<name>.onrender.com`) as its API base URL.

## Saved data

- `data/grids/*.json`: global trend grids (1981-2025), committed so nobody needs to rebuild them. Rebuild with
  `python -m app.services.grid_builder <layer_id> [start_year] [end_year]` (about 2 minutes each, reads the public
  NASA POWER Zarr store). Same method and annual-mean rule as `/api/trends`; the Ottawa cell matches it exactly.
- `data/snapshots/*.json`: raw NASA responses for specific requests (Ottawa T2M 1990-2025 included). Served only if
  NASA is unreachable and the request matches exactly. Create one with `python -m app.services.snapshots lat lon var start end`.

## Globe overlays

Two layer kinds, listed by `GET /api/layers`:

- `trend_grid`: numeric per-cell trend and p-value, computed offline from the POWER MERRA-2 monthly Zarr
  (global, 0.5 x 0.625 deg, monthly from 1981). Served from `backend/data/grids/{layer_id}.json`
  (override with `GRID_DATA_DIR`). Format: `TrendGrid` in `app/models/schemas.py`, arrays indexed `[lat][lon]`.
  Until a grid is built the layer reports `not_built` and `/grid` returns 503. Nothing is fabricated.
- `imagery`: rendered NASA GIBS tiles. The frontend loads `tiles.url_template` directly
  (fill `{time}`, `{z}`, `{y}`, `{x}`). Display only; no numbers or significance.

Planned (no verified NASA source yet): deforestation.

## NASA POWER notes

- Source: monthly point API, `community=RE`, MERRA-2 meteorology.
- Response keys are `YYYYMM`. Month `13` is NASA's annual aggregate and is ignored by the parser.
- `-999.0` (`header.fill_value`) marks missing values and is dropped, never imputed.
- The API's returned coordinates only echo the request. The parsed series reports the requested point and the
  true MERRA-2 cell centre (0.5 x 0.625 deg), computed from the grid definition and verified against the Zarr store.
- Failures (timeout, HTTP error, malformed payload) raise `NasaPowerError`; there is no fallback data.

## CORS

`http://localhost:3000` is always allowed. Add more origins with `EXTRA_CORS_ORIGINS` (comma-separated).
