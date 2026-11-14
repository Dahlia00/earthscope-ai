# EarthScope AI frontend

Next.js App Router, strict TypeScript, Tailwind CSS, Recharts, Lucide React, and React Leaflet. All changes for this milestone are contained in this directory.

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

**The response schema is proposed and awaits agreement with the backend developer.** See [API-CONTRACT.md](./API-CONTRACT.md). Runtime validation rejects incompatible responses. Live mode never silently falls back to demo data. No statistics are calculated in the frontend.

Changing any input clears earlier results. Demo data is intentionally restricted to Ottawa, 1990–2025; use the reset icon to restore those controls, then Analyze Location. Other locations and periods require the live backend. The current year bounds are 1900–2025, pending confirmation of backend coverage.

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

Optional discovery, comparison, AI explanation, and 3D globe features are outside this milestone.

Production builds use Next.js’s Webpack path because the local sandbox prevents Turbopack’s CSS worker from opening its required port. Development retains the existing Turbopack configuration.

## Phase 2 integration checkpoint

See [INTEGRATION-STATUS.md](./INTEGRATION-STATUS.md) for the inspected architecture, current backend limitations, learning explanation, and remaining work. `npm test` runs 32 API and diagnostic tests with fictional HTTP fixtures; it does not verify NASA observations. Live connection failures offer **Retry backend connection** without requiring a mode switch.

## Check a running backend

```sh
# From frontend/, using NEXT_PUBLIC_API_BASE_URL in .env.local:
npm run check:api
```

This checks the actual backend with the application's API client: health → supported temperature variable → Ottawa trend response. It reports the failing endpoint and exits nonzero on connection, contract, or unit mismatch. It never substitutes demo data. Start the teammate's backend before running it; this repository does not contain that implementation.

The command uses Next.js's development environment-file precedence. Passing the check verifies the proposed response format for one request, not NASA provenance or browser CORS. Review the reported source, confirm the methods with the backend developer, and test the UI against that backend.

## Cinematic landing milestone

Milestone 1 matches the supplied landing reference with a real rotating 3D Earth, illustrative signal cards, responsive feature cards, Motion reveals, and reduced-motion/pause/static controls. Existing analysis and integration mechanisms remain available. Discover a Mystery currently links to a clearly marked future-feature preview. See [LANDING-MILESTONE.md](./LANDING-MILESTONE.md) for the implementation walkthrough, browser checks, screenshots, and interview explanation.
