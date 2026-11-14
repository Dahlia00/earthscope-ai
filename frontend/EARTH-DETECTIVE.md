# Earth Detective: learning and verification

## What we built

A focused `/detective` page connects the existing visual identity and rotating 3D Earth to real backend-ranked hotspot regions. Users choose a built trend layer and direction, select a numbered marker or a region in the list, inspect regional magnitude/area/quality/limitations, and open a real point analysis using the backend's drilldown coordinate. The existing coordinate explorer remains available.

No backend file was edited. No hotspot examples or invented values are used as runtime fallback. Full raster overlays, region polygons, new statistics, two-slope comparison tests, and AI explanations are outside this milestone.

## How detection works

Evan's backend starts with precomputed NASA POWER/MERRA-2 annual trend grids. It applies Benjamini–Hochberg FDR to account for testing many cells, selects the strongest qualifying magnitudes, groups adjacent cells with the same trend direction (including across the antimeridian), removes tiny regions, and ranks the remainder by cluster mass: absolute area-weighted mean slope times area. Suspect-magnitude regions are ranked after unflagged ones.

The current parameters include FDR q = 0.05, the 98th magnitude percentile, and at least six cells per region; the frontend shows the returned parameters instead of hardcoding these decisions. Spatial correlation makes the FDR interpretation approximate. These are leads, not proof of causes or region-wide independent significance tests.

Precipitation currently carries a layer-wide warning (23 of 24 regions are suspect). The UI preserves that warning, adds caution styling to every displayed precipitation region, and never calls those leads reliable climate findings. Temperature's `not_assessed` quality flag is also not an endorsement. Detailed point results describe one source cell, not the hotspot's regional average.

## How geographic data reaches the screen

`api.layers()` and `api.hotspots()` use the existing centralized Fetch/error/cancellation code. Runtime validators check actual Pydantic response shapes, geometry, quality metadata, and request matching before React stores a result. Old results clear when filters change or requests fail; abort controllers prevent late responses from replacing newer selections.

The globe uses the returned centroid. Its spherical projection follows Three.js SphereGeometry's texture orientation: X = r cos(latitude) cos(longitude), Y = r sin(latitude), Z = −r cos(latitude) sin(longitude), with angles converted to radians. Each anchor is a child of the same rotating surface group as the Earth texture, so it stays attached to the geography. Three.js projects anchors through the current camera into screen coordinates; normal HTML buttons are positioned there. Far-side labels are hidden. Position updates avoid React state changes on every animation frame.

Normal DOM buttons were chosen instead of per-label React DOM roots after the browser test exposed teardown incompatibility in the initial portal approach. The region list remains the keyboard-accessible alternative when markers overlap, lie behind the Earth, or WebGL is unavailable.

## Components and code to study

- `EarthDetective`: loads and validates data, owns filters/selection, displays region list and request states.
- `DetectiveGlobe`: reuses the existing client-only Earth scene; owns marker buttons, pause/reduced-motion/visibility controls, and static fallback.
- `DetectiveScene`: places geographic anchors inside the rotating surface and projects them to the page; points the camera at selected leads.
- `DiscoveryCard`: shows raw backend regional evidence, quality flags/warnings, method, counts/parameters, and limitations; gates drilldown on advertised point-variable support.
- `src/lib/detective.ts`: tested geographic projection, exact drilldown URL generation, and strict point-link parsing.
- `src/lib/api.ts` / `types.ts`: verified layer/hotspot wire models and validation, extending the existing API client.
- `src/app/explore/page.tsx` / `Explorer`: initialize validated point links in live mode and automatically request their analysis. Request-time rendering (`connection()` inside Suspense) handles current-year validation correctly with Next.js cache components.

React state flows from the page into the globe, list, and card. Marker/list callbacks report a rank back to the page; one selected-rank state keeps them synchronized. Selecting a lead pauses rotation for inspection; the user can resume it. Surface rotation carries anchors; clouds retain their independent animation. Reduced motion, hidden tabs, and offscreen scenes stop continuous rendering. This adds only up to ten projected markers and reuses existing textures—no new dependencies or large global-grid download.

## Interview explanation

“I connected a React/Three.js discovery experience to real backend-detected environmental hotspots. I validated scientific and geographic metadata, projected centroids onto a rotating globe, synchronized accessible selections, and carried exact drilldown coordinates into an existing point-analysis flow. I kept all statistical detection on the backend and made data-quality uncertainty visible.”

## Test it yourself

Start FastAPI separately, then:

```sh
cd frontend
npm run dev
```

Open http://localhost:3000/detective. Select a region in the list and on the globe; verify the selected card and paused/focused view. Choose precipitation and read the layer-wide warning. Choose temperature range and confirm point drilldown is unavailable. Return to temperature, select a lead, and click Investigate this location: the explorer should automatically retrieve that point for the grid's exact period, not default Ottawa coordinates.

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run check:api
```

With a separate Chrome debug instance on port 9222 (see `LANDING-MILESTONE.md`) and the frontend on localhost:3000, run `node scripts/check-detective-browser.mjs`. The script tests actual returned coordinates, list/pointer marker selection, mobile layout, real NASA drilldown, precipitation caution, unsupported temperature-range drilldown, a controlled HTTP 503 followed by real retry recovery, and the existing demo. The controlled failure intercepts only the test browser; it does not alter or stop the backend. `scripts/check-explorer-browser.mjs` independently checks the existing live Ottawa flow and real insufficient-data handling.

Browser screenshots/reports are in ignored `artifacts/`: `detective-desktop.png`, `detective-mobile.png`, `detective-drilldown.png`, `detective-precipitation-caution.png`, and `detective-browser-results.json`. Physical-device GPU performance is not benchmarked. Markers are centroids, not complete region masks; overlapping leads remain selectable in the list. Full raster overlays are intentionally deferred.

The implementation and decisions were AI-generated. Personally review projection orientation, marker/list synchronization, request cancellation, method/quality interpretation, and the difference between regional evidence and point drilldown. Use real requests to confirm the behavior before presenting findings. Fixtures are captured real backend responses for offline testing only; mutated test cases are not discoveries and never populate the application.

Final verification: 88 automated tests pass, along with lint, explicit TypeScript checking, production build, and the original three-endpoint `check:api`. The detective and existing explorer browser workflows both pass. The final detective report contains no runtime errors; screenshots include the actual regional evidence and layer-wide precipitation warning. Marker projection orientation was also checked against the installed Three.js SphereGeometry source.
