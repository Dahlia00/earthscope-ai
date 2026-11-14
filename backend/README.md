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

| Endpoint | Status |
| --- | --- |
| `GET /api/health` | done |
| `GET /api/variables` | planned |
| `GET /api/trends` | planned |
| `GET /api/layers` | done (registry of globe overlays) |
| `GET /api/layers/{id}/grid` | done (serves a prebuilt grid; 503 if not built) |

## Globe overlays

Two layer kinds, listed by `GET /api/layers`:

- `trend_grid`: numeric per-cell trend and p-value, computed offline from the POWER MERRA-2 monthly Zarr
  (global, 0.5 x 0.625 deg, monthly from 1981). Served from `backend/data/grids/{layer_id}.json`
  (override with `GRID_DATA_DIR`). Format: `TrendGrid` in `app/models/schemas.py`, arrays indexed `[lat][lon]`.
  Until a grid is built the layer reports `not_built` and `/grid` returns 503. Nothing is fabricated.
- `imagery`: rendered NASA GIBS tiles. The frontend loads `tiles.url_template` directly
  (fill `{time}`, `{z}`, `{y}`, `{x}`). Display only; no numbers or significance.

Planned (no verified NASA source yet): deforestation. The grid builder is not written yet; it will reuse the
vectorised trend code from `trend_analysis.py` so the globe and `/api/trends` give identical results.

## NASA POWER notes

- Source: monthly point API, `community=RE`, MERRA-2 meteorology.
- Response keys are `YYYYMM`. Month `13` is NASA's annual aggregate and is ignored by the parser.
- `-999.0` (`header.fill_value`) marks missing values and is dropped, never imputed.
- NASA snaps the request to its grid cell; the parsed series reports both the requested and grid coordinates.
- Failures (timeout, HTTP error, malformed payload) raise `NasaPowerError`; there is no fallback data.

## CORS

`http://localhost:3000` is always allowed. Add more origins with `EXTRA_CORS_ORIGINS` (comma-separated).
