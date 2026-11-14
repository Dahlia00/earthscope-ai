# Proposed API contract — awaiting backend agreement

This is a frontend integration proposal, **not a confirmed backend schema**. The backend developer must approve or revise this contract before real integration is considered complete. Adapt `src/lib/api.ts` when the agreed schema is known. No backend files are changed by this milestone.

Base URL: `NEXT_PUBLIC_API_BASE_URL`, defaults to `http://localhost:8000`.
The backend must allow the frontend origin (normally `http://localhost:3000`) through CORS.
All requests use GET. Non-2xx, malformed JSON, invalid response structures, connection failures, and 20-second timeouts show an error; none fall back to demo values.

## GET /api/health

Any successful JSON response indicates availability, for example `{ "status": "ok" }`.

## GET /api/variables

```json
{ "variables": [{ "id": "T2M", "label": "Air temperature", "unit": "°C" }] }
```

Only T2M is exposed in this milestone. Live analysis stays disabled until health and variable discovery succeed and temperature is supported.

## GET /api/trends

Query: `latitude=45.4215&longitude=-75.6972&variable=T2M&start_year=1990&end_year=2025`.

Proposed response shape below uses **fictional illustrative numbers**, not NASA observations:

```json
{
  "location": { "latitude": 45.4215, "longitude": -75.6972 },
  "variable": "T2M",
  "unit": "°C",
  "source": "Fictional contract example",
  "start_year": 1990,
  "end_year": 2025,
  "observations": [{ "year": 1990, "value": 6.1 }, { "year": 1991, "value": null }],
  "statistics": {
    "direction": null,
    "rate_per_decade": null,
    "p_value": null,
    "confidence_interval_95": null,
    "significant": null,
    "observation_count": 1
  },
  "interpretation": "Insufficient observations to estimate a trend."
}
```

- Return chronological annual observations, with null for missing values. Empty arrays are supported.
- An optional `trend` number or null on each observation supplies the backend's trend line. The frontend never computes one.
- `direction`: `increasing`, `decreasing`, `stable`, or null.
- All unavailable statistical values must be explicit null. Never infer significance from a p-value on the frontend.
- `confidence_interval_95`: ordered `[lower, upper]` in measurement units **per decade**, or null.
- `rate_per_decade`: measurement units per decade, or null.
- `significant`: explicit boolean or null. The backend owns its test and threshold.
- `observation_count`: integer count of usable observations from the backend.
- `interpretation`: backend-provided explanation or null.
- Coordinates, variable, and period must match the request; unmatched results are withheld.
- Frontend currently allows integer years 1900–2025. Confirm NASA source coverage and limits with the backend developer before production use.

## Integration checkpoint — November 14, 2026

**Not agreed or verified against a backend.** This checkout contains no backend directory, OpenAPI definition, or backend branch in the locally available branch references. Requests to `http://localhost:8000/openapi.json` and `/api/health` could not connect. No actual response schema was available to compare; backend/frontend compatibility and NASA provenance remain unknown. Do not treat the existing Fetch wiring as a completed NASA integration.

The client now enforces these proposed rules before exposing a live response:

- Latitude/longitude must be finite and within geographic bounds.
- Variable, unit, and source must be nonempty strings.
- Annual observations must have unique, increasing integer years within the returned period. Missing annual values must be explicit nulls; the backend must include missing years so the chart can display gaps.
- Observation count cannot exceed the number of annual observation records. This assumes annual sampling; confirm this assumption with the backend developer.
- The returned selection must match the requested coordinates (tolerance 0.0001 degrees), variable, and period. Dataset grid-cell coordinates must be separate metadata, rather than replacing the requested point.
- Explicit backend significance, unavailable values, and supplied trend estimates are preserved. The frontend does not infer significance or calculate trends.
- Non-2xx responses, invalid JSON, schema mismatches, transport failures, and 20-second timeouts are distinct errors. Client cancellation is propagated to Fetch.

`GET /api/health` currently proves only HTTP/JSON reachability. An application readiness payload, upstream NASA availability, and any dataset-specific health details still need agreement. The UI only enables temperature after `/api/variables` advertises `T2M`.

### Backend handoff checklist

Please provide the following to finish the integration without guessing:

1. A running backend URL and its `/openapi.json`, or the actual FastAPI response models plus captured health/variables/trends JSON.
2. One real Ottawa T2M response for 1990–2025; confirm supported years, annual aggregation, units, missing-value handling, and the meaning of observation count.
3. The exact NASA product/source identifier and geographic grid coverage, with requested point distinguished from source grid-cell coordinates.
4. Trend method, significance test and threshold, confidence-interval method, and limitations. Confirm all rates and interval endpoints are per decade.
5. Empty-data and insufficient-data responses, a non-significant response, validation errors, and upstream NASA failure examples.
6. CORS permission for the local frontend origin, normally `http://localhost:3000`.

Record actual field differences here when those responses are available, then update the adapter and tests together. Do not approve this proposal on the backend developer's behalf. Verified comparison/discovery endpoints and comparability metadata remain future work.

### Run the handoff check

From `frontend/`, run:

```sh
npm run check:api
```

The command loads development environment files using Next.js's environment loader, including `.env.local`. An existing shell `NEXT_PUBLIC_API_BASE_URL` takes precedence. It uses the same API client and default Ottawa query as the UI, checks health, checks that T2M is advertised, then requests the 1990–2025 trend analysis. It fails with a nonzero exit code at the first failing endpoint. The returned trend unit must also match variable discovery.

A successful check means only that the backend satisfied the **proposed** contract for that request. The report labels source and statistical significance as backend-reported. Empty observations are explicitly warned about; success is not proof of NASA provenance, scientific validity, or browser CORS compatibility. No mock fixture is imported or used as fallback. Test those remaining properties with the backend developer and browser before claiming completed real-data integration.

Current local result: `/api/health` is unreachable, so no variables or trends were fetched and no schema compatibility was established.
