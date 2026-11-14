# Verified FastAPI contract

Verified against Evan's local `backend/app/models/schemas.py`, `backend/app/api/routes.py`, `backend/app/services/variables.py`, and the running service on **November 14, 2026**. This replaces the earlier frontend proposal. Backend code was inspected read-only and was not modified.

Base URL: `NEXT_PUBLIC_API_BASE_URL`, default `http://localhost:8000`. CORS currently permits `http://localhost:3000` (confirmed on actual responses and in backend configuration). Use that frontend origin; `127.0.0.1:3000` is a different origin.

## Confirmed mismatch and resolution

| Earlier frontend assumption                | Actual backend contract                                                       | Frontend handling                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `{ variables: [...] }`                     | Bare `VariableInfo[]`                                                         | Validate the array; reject the old wrapper                               |
| Variable `label`                           | Variable `name` plus scientific metadata                                      | Map `name` to UI `label`; retain the complete entry as `metadata`        |
| Variable string and top-level unit         | Nested `variable: { id, name, unit, trend_unit }`                             | Preserve raw units; adapt for existing components                        |
| `location.latitude/longitude`              | Requested point **and** source cell centre                                    | Match against requested coordinates, display both                        |
| Top-level start/end years                  | Requested and analyzed periods inside `period`                                | Match the request separately from actual coverage                        |
| `observations[].value`                     | Monthly observations plus `annual_values[].mean`                              | Chart the backend annual means; retain monthly observations              |
| `statistics.rate_per_decade` and CI tuple  | `trend.slope_per_decade`, separate CI endpoints and test diagnostics          | Validate, then map to the chart/insight view model without recalculating |
| No provenance/warnings/limitations         | `data_origin`, `retrieved_at`, warnings, limitations                          | Retain and display all metadata                                          |
| Null statistics for insufficient data      | HTTP 422 with FastAPI `detail`                                                | Show the backend message and clear results; no fake empty success        |
| Hardcoded temperature / 1900–2025 controls | T2M, PRECTOTCORR, RH2M; coverage starts 1981; end year up to current UTC year | Populate controls from validated variable metadata                       |
| 20-second client deadline                  | NASA upstream timeout is 30 seconds                                           | Use a 45-second client deadline with cancellation                        |

## GET /api/health

HTTP 200:

```json
{ "status": "ok", "service": "EarthScope AI Backend" }
```

The frontend checks both fields and requires `status: "ok"`. Health alone does not establish NASA upstream availability.

## GET /api/variables

HTTP 200, **bare array**. Actual T2M entry:

```json
[
  {
    "id": "T2M",
    "name": "Air temperature at 2 m",
    "unit": "C",
    "trend_unit": "C/decade",
    "description": "The average air (dry bulb) temperature at 2 meters above the surface of the earth.",
    "source": "NASA POWER, MERRA-2 reanalysis (monthly)",
    "coverage_start_year": 1981,
    "aggregation": "Day-weighted annual mean of the 12 monthly values; years with any missing month are excluded."
  }
]
```

The actual array also advertises `PRECTOTCORR` (unit `mm/day`, trend unit `mm/day/decade`) and `RH2M` (unit `%`, trend unit `percentage points/decade`). All three are now selectable in live mode. The complete captured array is in `tests/fixtures/variables.json`; it is test evidence, not a runtime data source.

All fields above are required. IDs must be unique; strings must be nonempty; coverage must be an integer year. Unknown additional fields are retained in the original metadata, rather than causing older clients to drop data. Demo mode remains a separate fixed T2M fixture.

## GET /api/trends

Query:

```text
/api/trends?latitude=45.4215&longitude=-75.6972&variable=T2M&start_year=1990&end_year=2025
```

Actual successful wire shape (TypeScript declarations mirror the Pydantic models):

```ts
interface BackendTrendsResponse {
  location: {
    requested_latitude: number;
    requested_longitude: number;
    cell_latitude: number;
    cell_longitude: number;
    elevation_m: number | null;
  };
  variable: { id: string; name: string; unit: string; trend_unit: string };
  source: string;
  data_origin: 'live' | 'snapshot';
  retrieved_at: string; // ISO timestamp including timezone
  period: {
    requested_start_year: number;
    requested_end_year: number;
    analyzed_start_year: number;
    analyzed_end_year: number;
  };
  counts: {
    monthly_valid: number;
    monthly_missing: number;
    annual_complete: number;
    incomplete_years_excluded: number[];
  };
  monthly_observations: { year: number; month: number; value: number }[];
  annual_values: { year: number; mean: number; months_used: number }[];
  trend: {
    method: string;
    slope_per_decade: number;
    ci_lower_per_decade: number;
    ci_upper_per_decade: number;
    confidence_level: number;
    p_value: number;
    significance_level: number;
    significant: boolean;
    mann_kendall_s: number;
    mann_kendall_z: number;
    lag1_autocorrelation: number;
    autocorrelation_flag: boolean;
    trend_line: { year: number; value: number }[];
  };
  interpretation: string;
  warnings: string[];
  limitations: string[];
}
```

### Scientific semantics

- Monthly values are provided by NASA POWER / MERRA-2. The backend forms day-weighted annual means only for years with all 12 valid months.
- The returned location describes one MERRA-2 grid cell, approximately 0.5 × 0.625 degrees, not a country or city-wide average. Requested coordinates and cell-centre coordinates can differ and must not be substituted for each other.
- `monthly_missing` counts explicit invalid/fill values seen by the backend parser. Fully absent upstream monthly keys need not be included in this count. Do not assume valid + missing equals the entire requested calendar coverage.
- `incomplete_years_excluded` lists partially observed years excluded by the backend. Entirely absent years can be absent from that list too. The chart fills calendar gaps with null values, never interpolated annual means.
- The analyzed period runs from the first to last complete annual value and can be narrower than the requested period. A successful trend requires at least **10 complete years**, as implemented by the backend service.
- The method is **Theil–Sen slope; two-sided, tie-corrected Mann–Kendall test; Sen confidence interval**. Do not describe this as ordinary least-squares regression.
- CI endpoints and slope are in `variable.trend_unit`. The current confidence level is 0.95 and test level 0.05; the UI uses returned levels rather than inventing them.
- `significant` and `autocorrelation_flag` are backend decisions. The frontend does not compute a p-value, significance decision, trend estimate, confidence interval, or autocorrelation diagnostic.
- Positive/negative slope signs are used only to label direction in the view model. Opposite signs do not establish a significant difference between locations.
- Raw `C` / `C/decade` is displayed as `°C` / `°C/decade` for typography only. All numeric values and original unit strings remain unchanged. Humidity trends retain **percentage points/decade**, rather than relative percent change.

### Provenance and missing-data handling

- `data_origin: "live"`: the backend successfully fetched NASA POWER.
- `data_origin: "snapshot"`: NASA was unreachable and the backend used an exact-match saved **real NASA response**. The original retrieval timestamp is returned. This is not fictional frontend demo data; the UI explicitly labels it as a saved snapshot and warns that it is not a fresh upstream retrieval.
- The full validated wire response is retained as `Analysis.backend`, including monthly observations, annual values, method/test diagnostics, warnings, and limitations. The existing chart uses a separate adapted view model.
- Chart values come directly from `annual_values[].mean`; its optional estimate line comes directly from `trend.trend_line`. Neither is generated by the frontend.
- Every warning is displayed. The autocorrelation flag is surfaced prominently. All limitations and diagnostics are accessible under Scientific evidence.

### Runtime validation

The frontend rejects absent fields, incorrect types, numeric strings, non-finite numbers, out-of-range coordinates/probabilities/correlations, malformed provenance, reversed CI bounds, unordered/duplicate observation dates, invalid months, non-complete annual records, inconsistent observation counts, periods outside the request, and mismatched trend-line years. Source cell coordinates are allowed to differ; requested coordinates must match within 0.0001 degrees. IDs and requested periods must match exactly.

Successful results must satisfy the actual non-null trend contract and service minimum of 10 complete years. The frontend does not relax this to accept the former fictional/demo wire format. Missing/null-valued **chart gaps** belong to the view model, not to the backend's successful annual-value schema.

### Errors

FastAPI errors use `{ "detail": "message" }` or the standard structured validation-detail array. The frontend displays backend detail as React text.

- HTTP 422: unsupported variable, coverage/date/coordinate validation, or fewer than 10 complete years.
- HTTP 502: NASA request failed and no matching saved real response is available.
- HTTP 200 with snapshot origin: a saved real response was available; provenance is explicit.
- Network/CORS errors, invalid JSON, validation failures, and 45-second deadlines remain distinct failures. None switches to demo data. Editing inputs/modes cancels and clears earlier results.

## Verification evidence

Captured actual requests returned health HTTP 200, three variables, and Ottawa trends HTTP 200 with `data_origin: "live"`, source `NASA POWER (MERRA2)`, **432 valid monthly observations and 36 complete annual values**. The returned requested point is `(45.4215, -75.6972)` and cell centre `(45.5, -75.625)`, elevation 123.92 m.

The captured response reported slope `0.501232090725354 C/decade`, p-value `0.0028546055044674874`, CI `[0.2092489069209117, 0.7519701401376456]`, confidence level `0.95`, and `significant: true`. These are recorded backend results for this cell/period, not hardcoded product values. The complete response is in `tests/fixtures/ottawa-trends.json`, with its original retrieval timestamp. Tests mutate copies only to exercise failure/provenance states; the application never imports these captures.

From `frontend/`:

```sh
npm run check:api
npm test
npm run lint
npx tsc --noEmit
npm run build
```

`check:api` uses the same adapter as the browser, loads `.env.local` with Next.js environment precedence, validates health → variables → Ottawa trends, checks variable/trend unit consistency, reports full scientific metadata, and exits nonzero on failure. It has no demo fallback. Browser verification must use `http://localhost:3000` to exercise the configured CORS origin.

## Earth Detective endpoints — verified November 14, 2026

Read-only implementation references: `backend/README.md`, `backend/app/models/schemas.py`, `backend/app/api/routes.py`, `backend/app/services/layers.py`, and `backend/app/services/detective.py`. Actual layer and temperature/precipitation hotspot responses are captured in the frontend's test fixtures. Backend grid/sample files were inspected without modification.

### GET /api/layers

Returns a bare `LayerInfo[]`, containing `id`, `name`, `category`, `kind` (`trend_grid` or `imagery`), `status` (`available`, `not_built`, `planned`), description, nullable observation/trend units, source, limitations, and nullable `tiles` metadata. Tile metadata contains URL template, projection, time start/period, and maximum zoom.

Four currently built trend layers are selectable: temperature, temperature range, precipitation, and humidity. Imagery layers do not provide numeric hotspot statistics; planned/not-built layers and imagery-only layers remain visibly disabled in the detective selector. The MVP does not request numeric grids or GIBS tiles.

The inspected temperature grid contains 361 latitude rows starting at -90° in 0.5° steps and 576 longitude columns starting at -180° in 0.625° steps, for 1981–2025. It is an offline precomputed NASA POWER/MERRA-2 trend grid, not live satellite imagery. No grid build timestamp is returned, so the frontend does not invent a freshness date.

### GET /api/detective/hotspots

Parameters: `layer_id`, `direction=both|increase|decrease`, `limit=1..50` (MVP uses 10). HTTP 404 for unknown/imagery layers; 503 for unbuilt grids. Errors use the shared FastAPI detail handling.

The response contains:

- `layer_id`, `layer_name`, `variable`, `unit`, `trend_unit`, period start/end years, and method.
- `parameters`: FDR q, magnitude percentile and threshold, minimum cells, robust scale, suspect relative-change threshold.
- `counts`: valid cells, FDR-significant cells, candidate cells, regions found, regions after minimum size, suspect regions. Counts describe the whole detection pass, not just the requested top list.
- `layer_warning`: null or a layer-wide data-quality warning.
- `hotspots`: ranked records containing direction, number of cells, area in km², area-weighted mean slope, robust strength, score, total period change, nullable baseline/relative change, quality flag, nullable warning, peak cell with raw p-value/slope, centroid, bounds including antimeridian flag, `drilldown`, and backend description.
- Full `limitations` array. Exact TypeScript wire declarations are in `src/lib/types.ts`; the original captured JSON is in `tests/fixtures/hotspots-temperature.json` and `hotspots-precipitation.json`.

Validation rejects malformed fields/coordinates, invalid signs, negative areas/counts, duplicate or unordered ranks, invalid bounds/antimeridian combinations, unknown quality flags, missing warnings for suspect-magnitude regions, invalid probability/filter values, excess results, and layer/direction mismatches. Units must agree with the selected catalog layer. Returned metadata is kept intact; no statistics, discovery scores, ranking, or significance are calculated in the frontend.

### Scientific interpretation and drilldown

Markers show the backend **centroid** on the globe, not the peak, drilldown coordinate, actual region boundary, or affected area. Backend rank determines list order. Increasing/decreasing direction is expressed with both arrows/text and cyan/purple; amber borders additionally indicate caution. Focusing a lead pauses rotation and points the camera toward that geographic anchor.

- `quality_flag: ok` means the backend magnitude screen did not flag that region, not a guarantee of scientific reliability.
- `not_assessed` is explicitly described as not screened, not a quality endorsement.
- `suspect_magnitude` warnings remain visible. A `layer_warning` applies caution to **every** region in that layer, including individually unflagged ones.
- The actual precipitation response reports 23 suspect regions out of 24 retained regions and a layer-wide warning. The frontend labels the layer's reliability unresolved, presents its hotspots as diagnostics rather than reliable climate findings, and preserves that caution in drilldown links.
- Raw peak p-values are for a single peak cell, not a region-wide test or a comparison between regions. A zero value is shown at returned precision, not as certainty. Spatial dependence and reanalysis artefacts remain explicit backend limitations.

The point action is enabled only when `/api/variables` advertises the response's `variable`. `T2M_RANGE` is currently absent there, so temperature-range discovery remains browsable but has no point-analysis link. Failure to verify point variables disables drilldown, without hiding valid regional evidence.

A valid action opens `/explore?latitude=<drilldown.latitude>&longitude=<drilldown.longitude>&variable=<response.variable>&start_year=<period_start_year>&end_year=<period_end_year>&from=detective`. Flagged leads also carry `detective_caution=1` as a conservative contextual caution, not a substitute for fresh point metadata. URL values are validated, then the explorer opens in Live API mode and requests the exact selection automatically. Invalid links are rejected rather than replaced with Ottawa/demo data. Point results retain their own metadata and warnings and are clearly distinguished from regional means.
