# EarthScope AI frontend

Next.js App Router, strict TypeScript, Tailwind CSS, Recharts, Lucide React, and Leaflet. All changes for this milestone are contained in this directory.

## Run locally

From the repository root (Node.js 20.9+ required):

```sh
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Choose **Start Exploring** to open http://localhost:3000/explore.

The explorer starts in **Demo data** mode with a fixed fictional Ottawa dataset for 1990–2025. No backend is required for the demo. Map tiles require internet access; coordinates remain editable if tiles cannot load. Scroll-wheel zoom is disabled to preserve page scrolling; use the map's zoom buttons.

The landing page uses a client-only Three.js Earth with locally bundled textures, independent clouds, atmosphere, and orbit controls. A locally rendered static preview covers loading, still mode, and unavailable WebGL2. See [LANDING-MILESTONE.md](./LANDING-MILESTONE.md) and [ASSET-CREDITS.md](./ASSET-CREDITS.md). No external image or font service is required at runtime.

## Live backend

Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` in `.env.local` and restart the development server. The backend must permit the frontend origin through CORS. Select **Live API** in the explorer. Health and temperature support must be confirmed before analysis becomes available.

**The response schema is verified against Evan's backend models and running API.** See [API-CONTRACT.md](./API-CONTRACT.md). Runtime validation rejects incompatible responses. Live mode never silently falls back to demo data. No statistics are calculated in the frontend.

Changing any input clears earlier results. Demo data is intentionally restricted to Ottawa, 1990–2025; use the reset icon to restore those controls, then Analyze Location. Other locations and periods require the live backend. In live mode, the earliest year comes from backend variable metadata (currently 1981) and the latest year is the current UTC year. At least 10 complete annual values are required by the backend. Demo mode remains fixed to Ottawa, 1990–2025.

## Checks and production

```sh
npm test
npm run lint
npm run build
npm start
```

`npm start` serves the production build at http://localhost:3000.

## Manual review

- Landing → Start Exploring → Ottawa sample chart and demo insights.
- Map click, coordinate edit, year edit → old results clear.
- Reset → Analyze Location → fixed demo reappears.
- Live API without backend → clear connection error, no fictional fallback.
- Live API with agreed contract → test empty observations, null values, unavailable statistics, and explicit non-significant results.
- Inspect mobile layout, keyboard focus, chart tooltip, and expandable accessible observation table.

Earth Detective and the 3D globe are implemented; see the discovery section below.

Production builds use Next.js’s Webpack path because the local sandbox prevents Turbopack’s CSS worker from opening its required port. Development retains the existing Turbopack configuration.

## Phase 2 integration checkpoint

See [INTEGRATION-STATUS.md](./INTEGRATION-STATUS.md) for the inspected architecture, current backend limitations, learning explanation, and remaining work. `npm test` runs API and diagnostic tests using captured actual backend responses plus deliberately mutated validation scenarios. Runtime analysis always calls the configured backend; test captures are never used as fallback. Live connection failures offer **Retry backend connection** without requiring a mode switch.

## Check a running backend

```sh
# From frontend/, using NEXT_PUBLIC_API_BASE_URL in .env.local:
npm run check:api
```

This checks the actual backend with the application's API client: health → supported temperature variable → Ottawa trend response. It reports the failing endpoint and exits nonzero on connection, contract, or unit mismatch. It never substitutes demo data. Start the teammate's backend before running it; the separately maintained implementation is in `backend/` and is not edited by the frontend.

The command uses Next.js's development environment-file precedence. Passing the check validates the verified wire schema and reports real response provenance; browser CORS must also be tested. Review the reported source, confirm the methods with the backend developer, and test the UI against that backend.

## Cinematic landing milestone

Milestone 1 matches the supplied landing reference with a real rotating 3D Earth, illustrative signal cards, responsive feature cards, Motion reveals, and reduced-motion/pause/static controls. Existing analysis and integration mechanisms remain available. Discover a Mystery opens the working Earth Detective experience. See [LANDING-MILESTONE.md](./LANDING-MILESTONE.md) for the implementation walkthrough, browser checks, screenshots, and interview explanation.

## Verified NASA analysis in the browser

Run the backend separately, set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` in `.env.local`, and run `npm run dev`. Open **http://localhost:3000/explore** (the configured CORS origin). Select **Live API**, keep Ottawa / T2M / 1990–2025, then **Analyze Location**. Confirm the NASA POWER source, live-versus-snapshot badge, retrieval timestamp, requested point versus grid-cell centre, observation counts, method, warnings, and limitations in Scientific evidence. A saved real NASA snapshot is explicitly identified; it is never mislabeled as a fresh retrieval or fictional demo.

Optional real-backend browser checks: with an isolated Chrome debugging instance on port 9222 and the frontend on localhost:3000, run `node scripts/check-explorer-browser.mjs` (Node 22+). This requests actual Ottawa data, checks the real insufficient-data error, and writes ignored screenshots/reports to `artifacts/`. Generated browser profiles/artifacts are excluded from lint and TypeScript source checking.

## Earth Detective

Open http://localhost:3000/detective (or Discover a Mystery in navigation). The page uses the real `/api/layers` and `/api/detective/hotspots` responses: select a layer, choose a direction, and investigate a returned region on the rotating Earth or accessible list. Markers identify centroids, not complete regional boundaries. Regional warnings are always visible; precipitation reliability is currently unresolved.

Supported drilldown opens the returned coordinate, variable, and grid period in live Earth Explorer and requests point analysis automatically. Temperature-range drilldown is disabled because the point API does not advertise `T2M_RANGE`. See [EARTH-DETECTIVE.md](./EARTH-DETECTIVE.md) for architecture, detection methods, learning notes, and browser verification. No backend changes or new dependencies are required.

## Submission quality review

See [QUALITY-REVIEW.md](./QUALITY-REVIEW.md) for verified behavior and remaining limits, and [DEPLOYMENT-CHECKLIST.md](./DEPLOYMENT-CHECKLIST.md) before publishing. Explorer uses the community OpenStreetMap raster basemap with visible attribution; it requires no API key.
