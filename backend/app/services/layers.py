"""Registry of globe overlay layers.

Two kinds:
  trend_grid - numeric per-cell trend + p-value we compute offline from the POWER MERRA-2
               monthly Zarr (https://nasa-power.s3.us-west-2.amazonaws.com/merra2/temporal/
               power_merra2_monthly_temporal_lst.zarr, 0.5 x 0.625 deg, monthly from 1981).
  imagery    - rendered NASA GIBS tiles. Display only: no numbers, so no significance tests.

Layers without a verified NASA source stay "planned"; they are never backed by made-up data.
"""

from pathlib import Path

from app.models.schemas import LayerInfo, TileSource

_POWER_SOURCE = "NASA POWER, MERRA-2 monthly (Zarr)"
_REANALYSIS_NOTE = (
    "MERRA-2 is a model-assimilated reanalysis, not direct station observations. "
    "Grid cells are ~50 km wide; a cell does not represent a country or region. "
    "Annual values are autocorrelated, so p-values may be optimistic. "
    "A significant trend does not establish cause."
)

_GIBS_EPSG3857 = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best"


def _trend_layer(id: str, name: str, category: str, variable: str, unit: str, description: str) -> LayerInfo:
    return LayerInfo(
        id=id,
        name=name,
        category=category,
        kind="trend_grid",
        status="not_built",
        description=description,
        unit=unit,
        trend_unit=f"{unit}/decade",
        source=f"{_POWER_SOURCE}, variable {variable}",
        limitations=_REANALYSIS_NOTE,
    )


LAYERS: list[LayerInfo] = [
    _trend_layer(
        "temperature_trend", "Temperature trend", "temperature", "T2M", "C",
        "Change in annual mean air temperature at 2 m.",
    ),
    _trend_layer(
        "temperature_range_trend", "Temperature range trend", "temperature", "T2M_RANGE", "C",
        "Change in the gap between minimum and maximum hourly 2 m temperature (daily swing).",
    ),
    _trend_layer(
        "precipitation_trend", "Precipitation trend", "precipitation", "PRECTOTCORR", "mm/day",
        "Change in mean MERRA-2 bias-corrected total precipitation.",
    ),
    _trend_layer(
        "humidity_trend", "Relative humidity trend", "humidity", "RH2M", "%",
        "Change in mean relative humidity at 2 m.",
    ),
    LayerInfo(
        id="vegetation_evi",
        name="Vegetation greenness (EVI)",
        category="vegetation",
        kind="imagery",
        status="available",
        description="Monthly Enhanced Vegetation Index from MODIS Aqua. Compare dates to see greening or browning.",
        unit=None,
        trend_unit=None,
        source="NASA GIBS, MODIS_Aqua_L3_EVI_Monthly",
        limitations="Rendered imagery only: no trend statistics. Compare dates by eye; seasonality dominates.",
        tiles=TileSource(
            url_template=f"{_GIBS_EPSG3857}/MODIS_Aqua_L3_EVI_Monthly/default/{{time}}/GoogleMapsCompatible_Level7/{{z}}/{{y}}/{{x}}.png",
            projection="EPSG:3857",
            time_start="2002-07-01",
            time_period="P1M",
            max_zoom=7,
        ),
    ),
    LayerInfo(
        id="ocean_chlorophyll",
        name="Ocean chlorophyll (bloom indicator)",
        category="ecology",
        kind="imagery",
        status="available",
        description="Daily chlorophyll-a concentration from MODIS Aqua, an indicator of phytoplankton blooms.",
        unit=None,
        trend_unit=None,
        source="NASA GIBS, MODIS_Aqua_L2_Chlorophyll_A",
        limitations="Daily swath data with gaps from cloud and orbit. Rendered imagery only: no trend statistics.",
        tiles=TileSource(
            url_template=f"{_GIBS_EPSG3857}/MODIS_Aqua_L2_Chlorophyll_A/default/{{time}}/GoogleMapsCompatible_Level7/{{z}}/{{y}}/{{x}}.png",
            projection="EPSG:3857",
            time_start="2002-07-04",
            time_period="P1D",
            max_zoom=7,
        ),
    ),
    LayerInfo(
        id="forest_loss",
        name="Deforestation",
        category="vegetation",
        kind="imagery",
        status="planned",
        description="Forest loss over time.",
        unit=None,
        trend_unit=None,
        source="None selected: no deforestation layer found in NASA GIBS",
        limitations=(
            "Needs a vetted source, e.g. Hansen/Global Forest Watch tree-cover loss, or a proxy such as "
            "MODIS land cover (GIBS MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual, 2001-2024). Not available yet."
        ),
    ),
]

_BY_ID = {layer.id: layer for layer in LAYERS}


def grid_path(grid_dir: Path, layer_id: str) -> Path:
    return grid_dir / f"{layer_id}.json"


def get_layer(layer_id: str, grid_dir: Path) -> LayerInfo | None:
    layer = _BY_ID.get(layer_id)
    return _with_status(layer, grid_dir) if layer else None


def list_layers(grid_dir: Path) -> list[LayerInfo]:
    return [_with_status(layer, grid_dir) for layer in LAYERS]


def _with_status(layer: LayerInfo, grid_dir: Path) -> LayerInfo:
    if layer.kind == "trend_grid" and grid_path(grid_dir, layer.id).is_file():
        return layer.model_copy(update={"status": "available"})
    return layer
