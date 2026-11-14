"""Earth Detective Mode: regions with the strongest statistically supported trends in a built grid.

Method:
  1. Benjamini-Hochberg FDR across all grid cells (a raw 5% test would flag ~5% of cells by chance).
  2. Keep FDR-significant cells whose |slope| is in the top MAGNITUDE_PERCENTILE of significant cells.
     Ranking is by effect size: p-values alone are ~0 for most cells of a strongly trending field.
  3. Merge adjacent same-sign cells (8-neighbour, wrapping across the antimeridian) into regions.
  4. Drop regions smaller than MIN_CELLS and rank by cluster mass: |area-weighted mean slope| x area.
     Mass favours large coherent signals over tiny extreme patches, which are the likeliest artefacts.
"""

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Literal

import numpy as np
from scipy import ndimage
from scipy.stats import false_discovery_control

from app.models.schemas import (
    Bounds,
    Hotspot,
    HotspotCounts,
    HotspotParameters,
    HotspotsResponse,
    LatLon,
    LayerInfo,
    PeakCell,
)

FDR_Q = 0.05
MAGNITUDE_PERCENTILE = 98.0
MIN_CELLS = 6
EARTH_RADIUS_KM = 6371.0088

METHOD = (
    "Benjamini-Hochberg FDR across all cells; strongest FDR-significant cells grouped into adjacent same-sign "
    "regions; regions ranked by cluster mass (|area-weighted mean trend| x area)."
)
LIMITATIONS = [
    "Hotspots are leads to investigate, not findings; significance does not prove causation.",
    "Based on MERRA-2 reanalysis, whose trends can be affected by changes in the observing systems it assimilates, "
    "especially for precipitation and humidity.",
    "Neighbouring cells are spatially correlated, so FDR control is approximate and regions are not independent tests.",
    "Ranking favours large regions with strong trends; it does not measure how unusual a trend is relative to natural variability.",
    "Regions are identified by coordinates only; no place names are assigned.",
]


def _label(text: str) -> str:
    return "°C" + text[1:] if text.startswith("C") else text


def _norm_lon(x: float | np.ndarray):
    return (x + 180.0) % 360.0 - 180.0


@lru_cache(maxsize=8)
def _load(path: str, mtime_ns: int) -> dict:
    raw = json.loads(Path(path).read_text())
    return {
        "meta": {k: v for k, v in raw.items() if k not in ("slope", "p_value")},
        "slope": np.array(raw["slope"], dtype=float),
        "p": np.array(raw["p_value"], dtype=float),
    }


def _row_areas_km2(lat: np.ndarray, lat_step: float, lon_step: float) -> np.ndarray:
    south = np.deg2rad(np.clip(lat - lat_step / 2, -90, 90))
    north = np.deg2rad(np.clip(lat + lat_step / 2, -90, 90))
    return EARTH_RADIUS_KM**2 * math.radians(lon_step) * (np.sin(north) - np.sin(south))


def _label_wrapped(mask: np.ndarray) -> np.ndarray:
    """8-connected labels where the first and last longitude columns are neighbours."""
    labels, n = ndimage.label(mask, structure=np.ones((3, 3)))
    parent = list(range(n + 1))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for r in range(mask.shape[0]):
        a = labels[r, 0]
        if not a:
            continue
        for rr in (r - 1, r, r + 1):
            if 0 <= rr < mask.shape[0] and labels[rr, -1]:
                parent[find(int(labels[rr, -1]))] = find(int(a))
    roots = np.array([find(i) for i in range(n + 1)])
    return roots[labels]


def _regions(labels: np.ndarray):
    rows, cols = np.nonzero(labels)
    lab = labels[rows, cols]
    order = np.argsort(lab, kind="stable")
    rows, cols, lab = rows[order], cols[order], lab[order]
    splits = np.flatnonzero(np.diff(lab)) + 1
    return zip(np.split(rows, splits), np.split(cols, splits))


def find_hotspots(
    grid_file: Path, layer: LayerInfo, direction: Literal["increase", "decrease", "both"], limit: int
) -> HotspotsResponse:
    data = _load(str(grid_file), grid_file.stat().st_mtime_ns)
    meta, slope, p = data["meta"], data["slope"], data["p"]
    lat = meta["lat"]["start"] + meta["lat"]["step"] * np.arange(meta["lat"]["count"])
    lon = meta["lon"]["start"] + meta["lon"]["step"] * np.arange(meta["lon"]["count"])
    lat_step, lon_step = meta["lat"]["step"], meta["lon"]["step"]
    area = np.repeat(_row_areas_km2(lat, lat_step, lon_step)[:, None], len(lon), axis=1)

    valid = np.isfinite(slope) & np.isfinite(p)
    significant = np.zeros_like(valid)
    significant[valid] = false_discovery_control(p[valid], method="bh") <= FDR_Q

    valid_slopes = slope[valid]
    scale = 1.4826 * float(np.median(np.abs(valid_slopes - np.median(valid_slopes))))
    threshold = float(np.percentile(np.abs(slope[significant]), MAGNITUDE_PERCENTILE)) if significant.any() else 0.0
    candidates = significant & (np.abs(slope) >= threshold)

    hotspots: list[Hotspot] = []
    found = kept = 0
    signs = {"increase": [1], "decrease": [-1], "both": [1, -1]}[direction]
    for sign in signs:
        for rows, cols in _regions(_label_wrapped(candidates & (np.sign(slope) == sign))):
            found += 1
            if len(rows) < MIN_CELLS:
                continue
            kept += 1
            hotspots.append(_describe(sign, rows, cols, slope, p, lat, lon, area, scale, lat_step, lon_step, meta, layer))

    hotspots.sort(key=lambda h: -h.score)
    hotspots = [h.model_copy(update={"rank": i}) for i, h in enumerate(hotspots[:limit], start=1)]
    return HotspotsResponse(
        layer_id=layer.id,
        layer_name=layer.name,
        variable=meta["variable"],
        unit=meta["unit"],
        trend_unit=meta["trend_unit"],
        period_start_year=meta["period_start_year"],
        period_end_year=meta["period_end_year"],
        method=METHOD,
        parameters=HotspotParameters(
            fdr_q=FDR_Q,
            magnitude_percentile=MAGNITUDE_PERCENTILE,
            magnitude_threshold=round(threshold, 4),
            min_cells=MIN_CELLS,
            robust_scale=round(scale, 4),
        ),
        counts=HotspotCounts(
            valid_cells=int(valid.sum()),
            fdr_significant_cells=int(significant.sum()),
            candidate_cells=int(candidates.sum()),
            regions_found=found,
            regions_after_min_size=kept,
        ),
        hotspots=hotspots,
        limitations=LIMITATIONS,
    )


def _describe(sign, rows, cols, slope, p, lat, lon, area, scale, lat_step, lon_step, meta, layer) -> Hotspot:
    w = area[rows, cols]
    s = slope[rows, cols]
    mean_slope = float(np.average(s, weights=w))
    total_area = float(w.sum())

    clat = float(np.average(lat[rows], weights=w))
    lon_rad = np.deg2rad(lon[cols])
    clon = float(_norm_lon(np.degrees(np.arctan2((w * np.sin(lon_rad)).sum(), (w * np.cos(lon_rad)).sum()))))

    d_lon = _norm_lon(lon[cols] - clon)
    west = float(_norm_lon(clon + d_lon.min() - lon_step / 2))
    east = float(_norm_lon(clon + d_lon.max() + lon_step / 2))
    bounds = Bounds(
        south=round(max(float(lat[rows].min()) - lat_step / 2, -90.0), 3),
        north=round(min(float(lat[rows].max()) + lat_step / 2, 90.0), 3),
        west=round(west, 3),
        east=round(east, 3),
        crosses_antimeridian=west > east,
    )

    peak = int(np.argmax(np.abs(s)))
    dist = _haversine_km(lat[rows], lon[cols], clat, clon)
    near = int(np.argmin(dist))

    years = meta["period_end_year"] - meta["period_start_year"]
    total_change = mean_slope * years / 10
    subject = layer.name.removesuffix(" trend").lower()
    d = 2 if abs(mean_slope) >= 0.1 else 3  # small-valued variables need more decimals
    description = (
        f"{'Increase' if sign > 0 else 'Decrease'} in {subject}: {mean_slope:+.{d}f} {_label(meta['trend_unit'])} on "
        f"average over {len(rows)} cells (about {total_area:,.0f} km²), {total_change:+.{d}f} {_label(meta['unit'])} "
        f"over {meta['period_start_year']}-{meta['period_end_year']}. Every cell passes FDR significance."
    )
    return Hotspot(
        rank=0,
        direction="increase" if sign > 0 else "decrease",
        n_cells=len(rows),
        area_km2=round(total_area),
        mean_slope=round(mean_slope, 4),
        strength=round(mean_slope / scale, 2) if scale > 0 else 0.0,
        score=round(abs(mean_slope) * total_area),
        total_change=round(total_change, 3),
        peak=PeakCell(
            latitude=float(lat[rows[peak]]),
            longitude=float(lon[cols[peak]]),
            slope=float(s[peak]),
            p_value=float(p[rows[peak], cols[peak]]),
        ),
        centroid=LatLon(latitude=round(clat, 3), longitude=round(clon, 3)),
        bounds=bounds,
        drilldown=LatLon(latitude=float(lat[rows[near]]), longitude=float(lon[cols[near]])),
        description=description,
    )


def _haversine_km(lat1: np.ndarray, lon1: np.ndarray, lat2: float, lon2: float) -> np.ndarray:
    p1, p2 = np.deg2rad(lat1), math.radians(lat2)
    dlon = np.deg2rad(lon1) - math.radians(lon2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * math.cos(p2) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(a))
