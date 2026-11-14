# Phase 2, first integration step

Inspected November 14, 2026. Work is limited to `frontend/`.

## Current architecture

- `src/app/page.tsx`: landing page; `/explore` renders the client-side `Explorer`.
- `src/components/explorer/Explorer.tsx`: form state, data mode, requests, cancellation, loading/errors, and results composition.
- `src/components/explorer/LocationMap.tsx`: React Leaflet map; map clicks update coordinates. The map is dynamically loaded without server rendering.
- `src/components/charts/TrendChart.tsx`: Recharts annual observations, optional backend trend estimates, missing-value gaps, source label, and accessible table.
- `src/components/insights/TrendSummary.tsx`: displays backend statistics and interpretation without calculating them.
- `src/lib/types.ts`: proposed TypeScript data model. TypeScript checks code at build time; runtime API validation is still required for external JSON.
- `src/lib/api.ts`: centralized Fetch requests, runtime validation, request/response selection matching, timeout/error handling.
- `src/data/mock-analysis.ts`: the only application observation/statistics fixture. Initial demo mode shows this fictional Ottawa dataset. Live mode never uses it as fallback.

## Backend status and missing work

No backend code or OpenAPI schema exists in the checkout. Local branch references expose only main/origin/main, not a backend branch. Neither localhost:8000/openapi.json nor localhost:8000/api/health was reachable during inspection. Actual field mismatches cannot be identified without an actual schema/response. All response shapes remain proposals.

The existing real-request path is wired, but has **not** displayed verified NASA data in this session. To complete integration, obtain the real API schema and sample responses, reconcile them in API-CONTRACT.md, adapt the client, confirm CORS and dataset coverage, and run the Ottawa analysis against the actual backend. Before claiming scientific comparability, also agree on sampling, methods, geographic coverage, significance criteria, and limitations. Current analysis metadata does not yet describe all of these.

## Learning milestone: a tested API boundary

**What we built:** Strengthened the existing live API client and added a retry action after connection failures. Live results are withheld if they belong to a different selection or violate the proposed annual-data contract.

**Technologies used:** TypeScript describes expected objects; Fetch retrieves JSON; runtime validation checks what actually arrives. React manages connection and result state. Node's built-in test runner and the already-installed TypeScript compiler run transport tests without a new dependency or a server.

**How it works:** The form sends a query to `api.trends`. The client builds the URL, performs Fetch with cancellation and a deadline, validates the response, and matches it to the query before returning it. React then supplies that object to the existing chart and insight components. Failures show an error; no demo substitution occurs.

**Important code:** `createApiClient` in `src/lib/api.ts` centralizes the HTTP boundary and permits controlled Fetch responses in tests. `parseAnalysis` validates incoming JSON; `matchRequest` prevents an otherwise valid response for the wrong selection from being displayed. `tests/api.test.mjs` tests the public request path with explicitly fictional data.

**Interview explanation:** “I built a typed API boundary for an environmental-data frontend. I validated external JSON at runtime, prevented stale or mismatched results, preserved backend significance decisions, and tested success and failure cases without requiring a live server. I kept simulated test data separate from scientific evidence.”

**Test it myself:** Run `cd frontend && npm test`, then `npm run lint` and `npm run build`. For the UI, run `npm run dev`, open http://localhost:3000/explore, select Live API with the backend stopped, and check the connection error and Retry backend connection button. Once the actual backend is available, set `.env.local`, restart the frontend, retry the connection, and analyze Ottawa. A successful mocked test does not establish that the real API or NASA data source works.

The new code, tests, and integration decisions in this step were AI-generated. Personally review the response assumptions, cancellation behavior, source attribution, units, and per-decade statistics; run the tests and a real-backend investigation before presenting scientific findings.

## Verification

- Baseline lint and production build passed before changes.
- Final verification: all 27 HTTP-boundary tests, lint, and production build passed (including Next.js TypeScript checking). Tests use synthetic responses; none contact NASA or a real FastAPI service.
- A local preview attempt failed with EPERM when binding 127.0.0.1:3000. No browser-control tool is available, so navigation, map clicks, retry interactions, and mobile layout remain unverified in a browser.
- Real API and NASA-data verification are blocked on backend availability and schema agreement.

## Remaining tasks in priority order

1. Obtain the actual backend response definitions and a real Ottawa response; agree on the contract and source metadata.
2. Adapt field mappings/year coverage, verify CORS, and test actual observations, errors, empty/missing data, and insufficient-data responses end to end.
3. Surface verified source/product, geographic coverage, sampling/method details, and limitations in the UI.
4. Run desktop/mobile browser tests for navigation, controls, chart, cancellation, and retries.
5. Build explicit two-location comparison only after agreeing on comparability criteria; reserve automated mystery discovery for a backend search/ranking endpoint.

## Learning milestone: a runnable backend handoff check

The repeated Phase 2 brief was re-inspected without rebuilding existing UI components. Backend code, OpenAPI definitions, and a backend branch remain unavailable locally. Direct localhost:8000 requests still fail. No real schema differences can be confirmed yet.

**What we built:** Added `npm run check:api` to exercise the actual configured backend through the existing frontend client. It stops at the first failed endpoint, checks consistency of units, and labels empty data and backend-reported provenance explicitly.

**Technologies used:** Node.js runs the command; Fetch in the shared TypeScript API client makes requests and validates responses. Next.js's existing environment loader reads `.env.local` with the same development precedence as `next dev`. The installed TypeScript compiler lets Node run the shared client without introducing a new runtime dependency. Node's test runner verifies the diagnostic workflow with fictional responses.

**How it works:** Environment configuration → shared default Ottawa query → `/api/health` → `/api/variables` → `/api/trends` → contract/selection validation → reported metadata. No demo data is loaded. A failure names its endpoint and sets exit code 1. Empty observations produce a warning even when the JSON structure is valid. Command-line Fetch does not enforce browser CORS.

**Important code:** `scripts/check-api.mjs` implements the diagnostic and failure reporting. `scripts/load-typescript.mjs` lets both tests and the diagnostic load the actual frontend client instead of duplicating its validators; this transpiles code, while the Next.js build independently checks TypeScript types.

**Interview explanation:** “I created a repeatable backend handoff check that shares the production frontend API client. It checks service reachability, supported variables, response structure, selection matching, and unit consistency, while keeping contract acceptance distinct from scientific verification.”

**Test it myself:** From `frontend/`, run `npm test` (32 tests), then `npm run check:api`. With no backend, expect a failed `/api/health` message and exit code 1. Once FastAPI is available, configure `NEXT_PUBLIC_API_BASE_URL` in `.env.local` and rerun the same command. A valid response reports the location, variable, period, backend source, observation count, and backend significance decision; review provenance and scientific methods personally before using these as findings.

This command, its tests, and its implementation decisions were AI-generated. Review the shared-client loader, environment precedence, annual-observation assumptions, and interpretation of a successful check. No backend files or UI components were changed in this milestone. Automated tests and lint pass; the production build also passes. Browser testing was not performed in this CLI-only step; the earlier port restriction and lack of browser tools remain verification limitations. Real NASA integration remains incomplete until a real backend is available and validated.

The priority order remains: obtain actual API definitions and responses; reconcile the contract and validate real Ottawa data; expose confirmed provenance/methodology/limitations; verify browser behavior and CORS; then implement comparable two-location investigations.

## Current status — verified integration with Evan's backend

This section supersedes the earlier “backend unavailable / proposed schema” checkpoints above. On November 14, 2026, backend files became available and the running localhost:8000 service was inspected. The mismatch was structural: variables are a bare array with `name`, and trends return nested Pydantic models containing requested/cell coordinates, variable metadata, requested/analyzed periods, counts, annual/monthly observations, full trend statistics, provenance, warnings, and limitations.

The frontend now validates that actual wire schema before adapting it for existing charts. `Analysis.backend` retains the full response. No backend files were modified. The explorer exposes the three confirmed backend variables, uses coverage metadata, charts supplied annual means and estimate points, distinguishes saved real snapshots from fresh upstream responses and fictional demo mode, and displays all warnings/limitations. Insufficient data is a real FastAPI 422 error, not an empty fabricated success.

The API diagnostic passes health, variables, and Ottawa trends with live NASA origin, 432 valid monthly values, and 36 complete annual values. Tests use captured real responses plus explicitly mutated transport cases. See the rewritten `API-CONTRACT.md` for the verified schema and field mappings.

Data flow: form → Fetch → runtime wire validation → request-selection matching → display adapter → Recharts, trend summary, and Scientific evidence. Backend statistics and observations remain unchanged; the adapter only renames fields, aligns chart points, and inserts null calendar gaps.

Interview explanation: “I reconciled a frontend's proposed contract with a separately developed FastAPI API. I added strict wire validation and a display adapter, preserved scientific provenance and diagnostics, and tested real API/browser success alongside failure cases without modifying the backend.”

Browser verification now confirms demo → live switching, all three advertised variables, an actual Ottawa request with live NASA origin and 36 annual observations, requested/cell coordinates and methodology display, mobile layout, and the real FastAPI insufficient-data 422 for 2024–2025. The previous chart is cleared on that error. Returning to demo shows only the explicitly fictional fixture. The ignored `artifacts/api-browser-results.json` records the HTTP responses; `artifacts/explorer-live-nasa.png` and `artifacts/explorer-live-nasa-mobile.png` show the live result.

The existing CARTO basemap currently serves an API-key notice in its tiles. This is separate from NASA analysis and did not prevent coordinate entry, API requests, or validated charts; no unrelated map-provider migration was made in this integration fix.

Final checks for this integration fix: `npm run check:api` passed all three endpoints with live origin; 57 automated tests passed; lint, explicit `npx tsc --noEmit`, and the production build passed. The real-backend Chrome workflow passed with no application runtime errors. Generated browser profiles are excluded from lint/TypeScript input; application source validation remains enabled.

Changed files: `src/lib/api.ts`, `src/lib/types.ts`, `src/lib/units.ts`; `src/components/explorer/Explorer.tsx`; `src/components/charts/TrendChart.tsx`; `src/components/insights/TrendSummary.tsx` and new `ScientificEvidence.tsx`; `src/data/mock-analysis.ts` (view-model CI field rename only); `scripts/check-api.mjs` and new `scripts/check-explorer-browser.mjs`; `tests/api.test.mjs` and captured fixtures; `API-CONTRACT.md`, `README.md`, this status document; `eslint.config.mjs` and `tsconfig.json` (generated-artifact exclusions). No backend source or configuration was edited.

A repository-level Python `lib/` ignore pattern was also hiding `frontend/src/lib/` from Git. Added a narrow exception in `frontend/.gitignore` so the API client, types, and unit-format helper can be versioned and reviewed with this fix; the root ignore rules remain unchanged.

## Earth Detective milestone

Added the `/detective` route, sharing the existing rotating Three.js Earth and real API client. It loads the verified layer catalog and ranked backend hotspots, plots centroid markers, supports accessible list/marker selection, shows regional evidence and all quality cautions, and opens supported drilldown coordinates in automatic live point analysis. Imagery/planned layers cannot be mistaken for numeric hotspot layers; temperature-range point analysis stays disabled because T2M_RANGE is not advertised by the point API.

The real temperature grid/example and precipitation warning example were inspected read-only. The current API reports four built trend layers and a precipitation layer warning for 23 of 24 regions. That warning applies to every displayed precipitation lead, including individually unflagged ones, and conservative caution context is retained in point links. No causal conclusions, regional p-values, ranking statistics, or fake discoveries are computed by the frontend.

The original 57 tests plus new detective coverage now total 88. Browser verification confirms actual marker coordinates and pointer/list selection, phone layout, real NASA point drilldown using (78, 56.25), T2M, 1981–2025, precipitation cautions, unsupported point-variable gating, controlled HTTP 503/retry recovery, and the original explorer regression workflow. The isolated browser reports no application runtime errors. See EARTH-DETECTIVE.md for implementation/learning notes, API-CONTRACT.md for the verified discovery endpoints, and ignored artifacts/ for screenshots and machine-readable browser reports. Backend files and existing dependencies were preserved.

Final Earth Detective checks: 88 automated tests, lint, explicit TypeScript checking, production build, the original API diagnostic, and the detective/explorer browser workflows all pass. No backend source files were changed. The final detective browser report has no runtime errors. Warning-bearing point links retain their caution context, and invalid drilldown links are rejected instead of loading demo/default observations.
