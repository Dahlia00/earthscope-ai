# Landing-page imagery and licenses

All imagery is bundled locally; the running application does not hotlink texture servers.

## Solar System Scope / INOVE

Source collection: https://www.solarsystemscope.com/textures/

License: Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/

Credit: **Solar System Scope**, developed by **INOVE**. The collection describes Earth textures as composites and adjustments of geographic imagery, including NASA Blue Marble. These are artistic historical textures, not current observations, measured environmental trends, or an endorsement by NASA.

Downloaded November 14, 2026. The original JPEGs are unchanged, only renamed:

| Local file in `public/textures/` | Original download | Dimensions | Bytes |
| --- | --- | --- | --- |
| `earth-day.jpg` | https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg | 2048 × 1024 | 463,087 |
| `earth-night.jpg` | https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg | 2048 × 1024 | 255,287 |
| `earth-clouds.jpg` | https://www.solarsystemscope.com/textures/download/2k_earth_clouds.jpg | 2048 × 1024 | 965,676 |
| `stars-milky-way.jpg` | https://www.solarsystemscope.com/textures/download/2k_stars_milky_way.jpg | 2048 × 1024 | 251,454 |

The 480 × 480 `earth-still.webp` (37,872 bytes) is an adapted rendering of our own Three.js scene using those Earth textures, captured in local Chrome and encoded as WebP. It inherits the required source credit and is used only as a loading/static fallback. Globe illumination, atmosphere, cloud blending, and orbital paths are artistic rendering effects. They do not encode current sunlight or satellite orbits.

Visible attribution and license links appear in the landing page's “Evidence before conclusions” section. Preserve this credit when reusing the assets.

## Code-generated visuals

The SVG sparklines, atmosphere shaders, orbital paths, gradients, and geometric backgrounds are implemented in the frontend. Hero signal values are hand-authored fictional illustrations, explicitly labeled on each card; they are not NASA findings and are not used by the API client or analysis dashboard.

Lucide icons are supplied by the existing `lucide-react` dependency under its ISC license. No NASA logo, official seal, or endorsement badge is used. The attached screenshots serve as layout references and are not shipped as product assets.
