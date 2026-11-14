# Captured backend responses

`health.json`, `variables.json`, and `ottawa-trends.json` were fetched from the running local FastAPI backend on November 14, 2026. The trend response retains its original retrieval time and reports `data_origin: live`, NASA POWER (MERRA2), 432 monthly observations, and 36 annual means for Ottawa T2M, 1990–2025.

These are read-only frontend test captures, not fictional demo data, and are never imported by the app or used as an API-failure fallback. See `API-CONTRACT.md` for provenance and scientific limitations. Negative tests mutate in-memory copies deliberately to validate rejection and display/transport behavior; those variations are not scientific findings.

Earth Detective adds `layers.json`, `hotspots-temperature.json`, and `hotspots-precipitation.json`, captured from the actual layer and hotspot endpoints on November 14, 2026. The precipitation capture preserves the layer-wide warning and all regional flags. These fixtures are never imported into the discovery UI as fallback. The backend's separate grid/sample-response files were also inspected read-only.
