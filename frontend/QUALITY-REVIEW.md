# Frontend submission quality review

Reviewed November 14, 2026 against the local FastAPI backend and a Next.js production build. Scope: frontend only; no backend edits, dependencies, or new product features.

## Findings and fixes

- Returning to Explorer through Next client navigation could crash Leaflet with an `appendChild` error. Cached routes reconnect effects while retaining component state. LocationMap now owns a fresh Leaflet instance per effect setup and removes it on cleanup; coordinate updates preserve zoom and callbacks stay current. Production navigation regression covers revisiting Explorer.
- CARTO tiles displayed an API-key notice. Replaced them with the community OpenStreetMap raster endpoint, retained visible attribution and normal browser cache/referrer behavior, disabled extra tile buffering, and preserved coordinate input when tiles fail. Actual tile responses returned HTTP 200. This is a best-effort community service, not guaranteed hosting.
- Made individual fictional landing signal labels more readable, declared smooth scrolling for Next navigation, and replaced deprecated Image priority with preload.
- Corrected stale landing browser QA that expected a removed mystery anchor; it now verifies the real Detective route. Updated stale README milestone descriptions.

## Verification

Production browser reports and screenshots are generated under ignored `artifacts/`. Scripts are committed source, not runtime application dependencies. Run them sequentially against an isolated Chrome debugging session on port 9222 and the production frontend at localhost:3000.

- `capture-landing.mjs`: rotating textured Earth, pointer interaction, pause/still controls, reduced motion, loading/WebGL fallback, responsive layouts, Explorer navigation.
- `check-explorer-browser.mjs`: explicitly fictional demo, real Ottawa NASA POWER temperature analysis and metadata, mobile layout, insufficient-data response, mode switching.
- `check-detective-browser.mjs`: actual returned hotspot markers and selection, real point drilldown, precipitation quality cautions, unavailable temperature-range point analysis, controlled API error/retry, mobile layout.
- `review-frontend-browser.mjs`: all three pages at 320/390/768/1280/1672px without horizontal overflow; cross-page navigation; OSM images and attribution; map selection invalidates stale results; real Ottawa humidity and precipitation with correct distinct units; accessible real-region selection without WebGL. Report records no application runtime errors.
- Final verification passed: all 88 automated tests, lint, strict TypeScript, production build, and all three actual backend API checks. All four production browser scripts passed after the map lifecycle fix.
- Production dependency audit: zero advisories. Full audit: seven moderate development-only advisories in the typescript-eslint/minimatch chain; audit fix dry-run proposed no changes. Lockfile and packages unchanged. Install dry-run succeeded; a fresh install was not performed.

## Scientific integrity

Hero numerical signals and Explorer demo observations are explicitly fictional. Live mode uses validated FastAPI responses and never silently substitutes mock observations. Scientific evidence preserves units, slopes, p-values, confidence intervals, observation counts, requested versus grid coordinates, origin, timestamps, methods, warnings, and limitations. Real saved snapshots are identified separately from fresh retrievals. Detective markers represent returned centroids, not region boundaries; drilldown uses the backend's returned point and period. Regional versus point results may differ. Precipitation remains cautioned (23 of 24 grid cells flagged in the reviewed dataset); temperature-range drilldown remains unavailable. Detected trends establish no causal explanation.

## Remaining limits and deployment gates

Public HTTPS backend URL and exact-origin CORS must be configured and tested after deployment. Node hosting is required. Include all intended currently untracked frontend modules when committing. Follow DEPLOYMENT-CHECKLIST.md. Existing backend staging was left untouched.

Browser coverage is desktop Chrome with mobile emulation and software WebGL, not physical devices or all browsers. An upstream Three.Clock deprecation warning remains nonblocking; no broad dependency changes were introduced to suppress it. No formal performance benchmark, full accessibility audit, or public deployment verification is claimed.

## Three components to understand

1. **Explorer** (`src/components/explorer/Explorer.tsx`) coordinates input state, demo/live mode, asynchronous requests, loading/errors, stale-result invalidation, chart output, and scientific evidence. API runtime validation complements TypeScript: types alone cannot validate network JSON.
2. **EarthDetective** (`src/components/detective/EarthDetective.tsx`) coordinates backend layer filters, ranked hotspots, shared list/globe selection, quality warnings, and exact point drilldown links. It visualizes backend discoveries rather than inventing or recomputing statistics.
3. **EarthScene** (`src/components/landing/EarthScene.tsx`) renders sphere meshes with local textures, lighting/shaders, independently moving clouds, and camera controls through React Three Fiber. Animation uses frame updates rather than React state every frame. DetectiveScene adds coordinate-projected centroid markers; a list remains usable when WebGL is unavailable.
