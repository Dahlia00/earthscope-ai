export interface AnalysisQuery {
  latitude: number;
  longitude: number;
  variable: string;
  start_year: number;
  end_year: number;
}
export interface HealthResponse {
  status: string;
  service: string;
}
export interface BackendVariable {
  id: string;
  name: string;
  unit: string;
  trend_unit: string;
  description: string;
  source: string;
  coverage_start_year: number;
  aggregation: string;
}
export interface Variable {
  id: string;
  label: string;
  unit: string;
  metadata?: BackendVariable;
}
export interface MonthlyObservation {
  year: number;
  month: number;
  value: number;
}
export interface AnnualValue {
  year: number;
  mean: number;
  months_used: number;
}
export interface TrendPoint {
  year: number;
  value: number;
}
export interface BackendTrendsResponse {
  location: {
    requested_latitude: number;
    requested_longitude: number;
    cell_latitude: number;
    cell_longitude: number;
    elevation_m: number | null;
  };
  variable: { id: string; name: string; unit: string; trend_unit: string };
  source: string;
  data_origin: 'live' | 'snapshot';
  retrieved_at: string;
  period: {
    requested_start_year: number;
    requested_end_year: number;
    analyzed_start_year: number;
    analyzed_end_year: number;
  };
  counts: {
    monthly_valid: number;
    monthly_missing: number;
    annual_complete: number;
    incomplete_years_excluded: number[];
  };
  monthly_observations: MonthlyObservation[];
  annual_values: AnnualValue[];
  trend: {
    method: string;
    slope_per_decade: number;
    ci_lower_per_decade: number;
    ci_upper_per_decade: number;
    confidence_level: number;
    p_value: number;
    significance_level: number;
    significant: boolean;
    mann_kendall_s: number;
    mann_kendall_z: number;
    lag1_autocorrelation: number;
    autocorrelation_flag: boolean;
    trend_line: TrendPoint[];
  };
  interpretation: string;
  warnings: string[];
  limitations: string[];
}
export interface Observation {
  year: number;
  value: number | null;
  trend?: number | null;
}
// View model shared by the explicit fictional demo and validated backend results.
export interface Analysis {
  location: { latitude: number; longitude: number };
  variable: string;
  variable_name?: string;
  unit: string;
  trend_unit?: string;
  source: string;
  start_year: number;
  end_year: number;
  observations: Observation[];
  statistics: {
    direction: 'increasing' | 'decreasing' | 'stable' | null;
    rate_per_decade: number | null;
    p_value: number | null;
    confidence_interval: [number, number] | null;
    confidence_level?: number;
    significant: boolean | null;
    observation_count: number;
  };
  interpretation: string | null;
  // The complete validated wire response is retained, without dropping scientific metadata.
  backend?: BackendTrendsResponse;
}
export const TEMPERATURE: Variable = { id: 'T2M', label: 'Air temperature', unit: '°C' };
export const DEFAULT_QUERY: AnalysisQuery = {
  latitude: 45.4215,
  longitude: -75.6972,
  variable: 'T2M',
  start_year: 1990,
  end_year: 2025,
};

export interface LayerInfo {
  id: string;
  name: string;
  category: string;
  kind: 'trend_grid' | 'imagery';
  status: 'available' | 'not_built' | 'planned';
  description: string;
  unit: string | null;
  trend_unit: string | null;
  source: string;
  limitations: string;
  tiles: {
    url_template: string;
    projection: string;
    time_start: string;
    time_period: string;
    max_zoom: number;
  } | null;
}
export interface GeoPoint {
  latitude: number;
  longitude: number;
}
export interface Hotspot {
  rank: number;
  direction: 'increase' | 'decrease';
  n_cells: number;
  area_km2: number;
  mean_slope: number;
  strength: number;
  score: number;
  total_change: number;
  baseline_mean: number | null;
  relative_change: number | null;
  quality_flag: 'ok' | 'suspect_magnitude' | 'not_assessed';
  warning: string | null;
  peak: GeoPoint & { slope: number; p_value: number };
  centroid: GeoPoint;
  bounds: {
    south: number;
    north: number;
    west: number;
    east: number;
    crosses_antimeridian: boolean;
  };
  drilldown: GeoPoint;
  description: string;
}
export interface HotspotsResponse {
  layer_id: string;
  layer_name: string;
  variable: string;
  unit: string;
  trend_unit: string;
  period_start_year: number;
  period_end_year: number;
  method: string;
  parameters: {
    fdr_q: number;
    magnitude_percentile: number;
    magnitude_threshold: number;
    min_cells: number;
    robust_scale: number;
    suspect_relative_change: number;
  };
  counts: {
    valid_cells: number;
    fdr_significant_cells: number;
    candidate_cells: number;
    regions_found: number;
    regions_after_min_size: number;
    suspect_regions: number;
  };
  layer_warning: string | null;
  hotspots: Hotspot[];
  limitations: string[];
}
export interface HotspotsQuery {
  layer_id: string;
  direction: 'increase' | 'decrease' | 'both';
  limit: number;
}
