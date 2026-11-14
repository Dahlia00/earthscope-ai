# Milestone 1 — cinematic landing page

Implemented only the landing redesign and the shared navigation needed to reach it. The Earth Explorer and its existing typed API client, validators, demo fixture, tests, `check:api` command, and contract remain in place. The comparison dashboard has not been built in this milestone.

## What we implemented

The landing page follows the first reference's composition: compact navigation, left-aligned italic EarthScope AI headline, cyan actions, large right-hand Earth, three floating glass signal cards, a star field and planetary horizon, then three horizontal feature cards. Below it are How It Works, an honest mystery-feature preview, and a science/attribution section. On phones, the globe follows the copy and the feature cards stack.

The Earth is a WebGL-rendered sphere, not an image rotated with CSS. A separate textured cloud sphere rotates at a slightly different rate. Surface shaders blend day imagery and city lights around a fixed artistic sun direction; a separate atmospheric shell adds a blue rim. Two 3D orbital paths have moving points. Dragging rotates the camera around the scene. Pause, still-view, reduced-motion, hidden-tab, and offscreen states limit animation.

## Files to study

- `src/app/page.tsx`: server-rendered page content, sections, and working links.
- `src/app/landing.css`: landing-scoped visual system and desktop/tablet/mobile layouts. Existing dashboard styles remain in `globals.css`.
- `src/components/landing/EarthVisual.tsx`: client-only loader, WebGL2 detection, error/context-loss fallback, pause/still controls, visibility state, and illustrative signal cards.
- `src/components/landing/EarthScene.tsx`: Three.js meshes, GLSL shaders, frame updates, orbit paths, camera controls, and demand-frame invalidation after resize.
- `src/components/landing/Reveal.tsx`: reusable Motion reveal wrapper.
- `src/components/landing/useMotionPreference.ts`: subscribes to operating-system reduced-motion changes while the page is open, using React's `useSyncExternalStore`.
- `src/components/layout/Header.tsx`: Home, Explore, mystery-preview, and About navigation. Mystery links reach the clearly marked preview; they do not simulate discoveries.
- `scripts/capture-landing.mjs`: optional Chrome DevTools Protocol visual checks and screenshots. Requires Node 22+ for its built-in WebSocket; the app itself retains Next.js's Node requirement.
- `ASSET-CREDITS.md`: original texture URLs, dimensions, licensing, modifications, and scientific-use limitations.

## What the new libraries do

- **Three.js:** creates GPU geometry, materials, textures, lights, and shaders.
- **React Three Fiber:** lets React components describe and manage that Three.js scene. `useFrame` updates mesh rotation using elapsed frame time rather than assuming a fixed frame rate.
- **Drei:** supplies texture loading/caching, orbit controls, stars, and efficient line helpers.
- **Motion for React:** handles short entrance/reveal and sparkline animations. CSS supplies restrained floating on the illustrative cards.

React sends `animated` from `EarthVisual` to `EarthScene`. It becomes false when paused, reduced motion is enabled, the tab is hidden, or the scene leaves the viewport. In this state, continuous rendering changes to demand rendering. A small resize effect requests fresh frames so paused canvases repaint after responsive layout changes. Geometry/materials are managed by the Fiber scene lifecycle; cached textures are reused when switching back from still mode.

## How this connects to FastAPI

The landing globe is a local visual and makes no analysis requests. Start Exploring opens `/explore`, whose existing React controls call `src/lib/api.ts` and pass validated observations/statistics to Recharts and insight components. All hero rates and sparklines are illustrative, individually labeled, and separate from analysis results. No backend statistics or significance are calculated here. The backend is still separately developed; this redesign does not establish real-data availability.

## Interview explanation

“I implemented a reference-driven scientific landing page with a real, client-only WebGL Earth. I used React Three Fiber to compose independently animated surface, cloud, atmosphere, and orbital layers, added Motion interactions, and built reduced-motion, visibility, and static fallbacks. I preserved the existing validated API integration and kept decorative signals distinct from scientific evidence.”

## Run and test it yourself

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. Drag the Earth, pause and resume it, switch to Still view and back, follow Discover a Mystery, and use Start Exploring to confirm the map and chart still load. Enable Reduce Motion in your system/browser; the globe should stop automatically, including when the setting changes while the page is open. Check widths around 390, 768, 1280, and 1672 pixels.

```sh
npm test
npm run lint
npm run build
npm run check:api
```

The last command needs the real FastAPI backend and may fail while it is unavailable. It never substitutes the hero values or demo data.

## Browser verification and screenshots

Chrome headless with a separate local profile and software WebGL rendered the 3D scene. The automated visual workflow verified desktop (1672 × 941), mobile (390 × 844), no page overflow at those widths or at 320/768/1280 pixels, pause state, pointer dragging changing the rendered Earth, the mystery anchor, live reduced-motion changes, still view, a forced WebGL2-unavailable fallback, and navigation to the explorer with map/chart mounting. Final browser output contained no runtime or console errors. Screenshots were visually inspected against the supplied references, then hero dimensions and spacing were adjusted. No pixel-perfect match or device GPU benchmark is claimed.

Generated images and `browser-results.json` are in the ignored `artifacts/` directory. The optional capture script expects a local preview at `http://localhost:3000` and a separate Chrome debug instance on port 9222. Start an isolated instance on macOS with:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9222 --user-data-dir="$PWD/.next/visual-qa-profile" --no-first-run --no-default-browser-check --use-angle=swiftshader --enable-unsafe-swiftshader about:blank
```

In another terminal, run `node scripts/capture-landing.mjs`. Close only that isolated browser when finished. Use `localhost` for preview URLs: the already-running dev server blocked HMR from the 127.0.0.1 origin during the first attempt.

## Limits and review

The textures total about 1.97 MB, including the starfield and 38 KB fallback. Texture dimensions are capped at 2048 × 1024; rendering caps device pixel ratio at 1.5, uses fewer than roughly 30,000 sphere triangles, avoids postprocessing, and limits background stars to 650. Those are implementation choices, not measured FPS guarantees. Physical mobile devices, native-GPU performance, and additional browsers still need personal testing.

A small custom motion-preference hook was necessary because the installed Motion hook snapshots its preference at mount; the browser test exposed that live preference changes were not reflected. The new hook subscribes to media-query changes explicitly.

The implementation and its design/engineering decisions were AI-generated. Review the shaders, texture attribution, client/server boundary, motion controls, fallback/error handling, and scientific copy yourself. Real API integration and verified automated mystery discovery remain separate work. Dashboard and comparison reference layouts are reserved for Milestones 2 and 3.
