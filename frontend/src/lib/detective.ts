import type { AnalysisQuery, GeoPoint, Hotspot, HotspotsResponse } from './types';

// Three.js SphereGeometry's UV orientation: 0° lies on +X, 90°E on -Z.
// Marker radius is just above the cloud/atmosphere shells; geography is not jittered.
export function geoToCartesian(
  { latitude, longitude }: GeoPoint,
  radius = 1.205,
): [number, number, number] {
  const lat = (latitude * Math.PI) / 180,
    lon = (longitude * Math.PI) / 180;
  return [
    radius * Math.cos(lat) * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * Math.cos(lat) * Math.sin(lon),
  ];
}
export function buildDrilldownHref(response: HotspotsResponse, hotspot: Hotspot): string {
  const params: Record<string, string> = {
    latitude: String(hotspot.drilldown.latitude),
    longitude: String(hotspot.drilldown.longitude),
    variable: response.variable,
    start_year: String(response.period_start_year),
    end_year: String(response.period_end_year),
    from: 'detective',
  };
  if (response.layer_warning || hotspot.quality_flag === 'suspect_magnitude')
    params.detective_caution = '1';
  return `/explore?${new URLSearchParams(params)}`;
}
export function parseExplorerQuery(
  params: Record<string, string | string[] | undefined>,
): AnalysisQuery | null {
  const keys = ['latitude', 'longitude', 'variable', 'start_year', 'end_year'] as const;
  if (
    !keys.every((key) => typeof params[key] === 'string' && (params[key] as string).trim() !== '')
  )
    return null;
  const latitude = Number(params.latitude),
    longitude = Number(params.longitude);
  const start_year = Number(params.start_year),
    end_year = Number(params.end_year);
  if (
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180 ||
    !Number.isInteger(start_year) ||
    !Number.isInteger(end_year) ||
    start_year < 1900 ||
    end_year > new Date().getUTCFullYear() ||
    start_year > end_year ||
    !/^[A-Z0-9_]+$/.test(params.variable as string)
  )
    return null;
  return { latitude, longitude, variable: params.variable as string, start_year, end_year };
}
