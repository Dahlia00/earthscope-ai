import type {
  LayerInfo,
  HotspotsResponse,
  HotspotsQuery,
  Analysis,
  AnalysisQuery,
  BackendTrendsResponse,
  BackendVariable,
  HealthResponse,
  Variable,
} from './types';

const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(
  /\/$/,
  '',
);
const TIMEOUT_MS = 45000; // FastAPI's NASA request may take up to 30 seconds.
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown): v is number => finite(v) && Number.isInteger(v);
const nonnegative = (v: unknown): v is number => integer(v) && v >= 0;
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const probability = (v: unknown): v is number => finite(v) && v >= 0 && v <= 1;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
const coordinate = (v: unknown, limit: number) => finite(v) && Math.abs(v) <= limit;
function invalid(field: string): never {
  throw new Error(
    `Backend response failed validation at ${field}. See frontend/API-CONTRACT.md for the verified API contract.`,
  );
}

export function parseHealth(data: unknown): HealthResponse {
  if (!object(data) || data.status !== 'ok' || !text(data.service)) return invalid('health');
  return data as unknown as HealthResponse;
}

export function parseVariables(data: unknown): Variable[] {
  if (!Array.isArray(data)) return invalid('variables (expected an array)');
  const ids = new Set<string>();
  return data.map((v) => {
    if (
      !object(v) ||
      !text(v.id) ||
      ids.has(v.id) ||
      !text(v.name) ||
      !text(v.unit) ||
      !text(v.trend_unit) ||
      !text(v.description) ||
      !text(v.source) ||
      !integer(v.coverage_start_year) ||
      v.coverage_start_year < 1900 ||
      !text(v.aggregation)
    ) {
      return invalid('variables[]');
    }
    ids.add(v.id);
    return { id: v.id, label: v.name, unit: v.unit, metadata: v as unknown as BackendVariable };
  });
}

// Validate the wire model before adapting it. No regression/test/CI is calculated here.
export function parseBackendAnalysis(data: unknown): BackendTrendsResponse {
  if (!object(data)) return invalid('trends');
  const l = data.location,
    v = data.variable,
    p = data.period,
    c = data.counts,
    t = data.trend;
  if (
    !object(l) ||
    !coordinate(l.requested_latitude, 90) ||
    !coordinate(l.requested_longitude, 180) ||
    !coordinate(l.cell_latitude, 90) ||
    !coordinate(l.cell_longitude, 180) ||
    !(l.elevation_m === null || finite(l.elevation_m))
  )
    return invalid('location');
  if (!object(v) || !text(v.id) || !text(v.name) || !text(v.unit) || !text(v.trend_unit))
    return invalid('variable');
  if (
    !text(data.source) ||
    !['live', 'snapshot'].includes(data.data_origin as string) ||
    !text(data.retrieved_at) ||
    !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(data.retrieved_at) ||
    !Number.isFinite(Date.parse(data.retrieved_at))
  )
    return invalid('provenance');
  if (
    !object(p) ||
    !integer(p.requested_start_year) ||
    !integer(p.requested_end_year) ||
    !integer(p.analyzed_start_year) ||
    !integer(p.analyzed_end_year) ||
    p.requested_start_year < 1900 ||
    p.requested_end_year > 9999 ||
    p.requested_start_year > p.requested_end_year ||
    p.analyzed_start_year > p.analyzed_end_year ||
    p.analyzed_start_year < p.requested_start_year ||
    p.analyzed_end_year > p.requested_end_year
  )
    return invalid('period');
  if (
    !object(c) ||
    !nonnegative(c.monthly_valid) ||
    !nonnegative(c.monthly_missing) ||
    !nonnegative(c.annual_complete) ||
    !Array.isArray(c.incomplete_years_excluded)
  )
    return invalid('counts');
  if (!Array.isArray(data.monthly_observations) || !Array.isArray(data.annual_values))
    return invalid('observations');
  let previous = -Infinity;
  const monthsByYear = new Map<number, number>();
  for (const o of data.monthly_observations) {
    if (
      !object(o) ||
      !integer(o.year) ||
      !integer(o.month) ||
      o.month < 1 ||
      o.month > 12 ||
      !finite(o.value) ||
      o.year < p.requested_start_year ||
      o.year > p.requested_end_year ||
      o.year * 12 + o.month <= previous
    )
      return invalid('monthly_observations');
    previous = o.year * 12 + o.month;
    monthsByYear.set(o.year, (monthsByYear.get(o.year) ?? 0) + 1);
  }
  previous = -Infinity;
  const annualYears = new Set<number>();
  for (const a of data.annual_values) {
    if (
      !object(a) ||
      !integer(a.year) ||
      a.year <= previous ||
      a.year < p.analyzed_start_year ||
      a.year > p.analyzed_end_year ||
      !finite(a.mean) ||
      a.months_used !== 12 ||
      monthsByYear.get(a.year) !== 12
    )
      return invalid('annual_values');
    previous = a.year;
    annualYears.add(a.year);
  }
  // These are structural count checks, not a recomputation of scientific estimates.
  if (
    c.monthly_valid !== data.monthly_observations.length ||
    c.annual_complete !== data.annual_values.length ||
    c.monthly_valid + c.monthly_missing >
      (p.requested_end_year - p.requested_start_year + 1) * 12 ||
    data.annual_values.length < 10 ||
    data.annual_values[0].year !== p.analyzed_start_year ||
    data.annual_values[data.annual_values.length - 1].year !== p.analyzed_end_year
  )
    return invalid('counts / analyzed coverage');
  previous = -Infinity;
  const excluded = new Set<number>();
  for (const year of c.incomplete_years_excluded) {
    if (
      !integer(year) ||
      year <= previous ||
      year < p.requested_start_year ||
      year > p.requested_end_year ||
      annualYears.has(year) ||
      !monthsByYear.has(year) ||
      monthsByYear.get(year) === 12
    )
      return invalid('incomplete_years_excluded');
    previous = year;
    excluded.add(year);
  }
  for (const [year, count] of monthsByYear) {
    if ((count === 12 && !annualYears.has(year)) || (count < 12 && !excluded.has(year)))
      return invalid('annual coverage');
  }
  if (
    !object(t) ||
    !text(t.method) ||
    !finite(t.slope_per_decade) ||
    !finite(t.ci_lower_per_decade) ||
    !finite(t.ci_upper_per_decade) ||
    t.ci_lower_per_decade > t.ci_upper_per_decade ||
    !probability(t.confidence_level) ||
    t.confidence_level === 0 ||
    t.confidence_level === 1 ||
    !probability(t.p_value) ||
    !probability(t.significance_level) ||
    t.significance_level === 0 ||
    t.significance_level === 1 ||
    typeof t.significant !== 'boolean' ||
    !integer(t.mann_kendall_s) ||
    !finite(t.mann_kendall_z) ||
    !finite(t.lag1_autocorrelation) ||
    Math.abs(t.lag1_autocorrelation) > 1 ||
    typeof t.autocorrelation_flag !== 'boolean' ||
    !Array.isArray(t.trend_line)
  )
    return invalid('trend');
  if (t.trend_line.length !== data.annual_values.length) return invalid('trend.trend_line');
  for (let i = 0; i < t.trend_line.length; i++) {
    const point = t.trend_line[i];
    if (!object(point) || point.year !== data.annual_values[i].year || !finite(point.value))
      return invalid('trend.trend_line');
  }
  if (
    typeof data.interpretation !== 'string' ||
    !strings(data.warnings) ||
    !strings(data.limitations)
  )
    return invalid('interpretation / warnings / limitations');
  return data as unknown as BackendTrendsResponse;
}

export function parseAnalysis(data: unknown): Analysis & { backend: BackendTrendsResponse } {
  const backend = parseBackendAnalysis(data);
  const { location, variable, period, trend, counts } = backend;
  const annual = new Map(backend.annual_values.map((a) => [a.year, a.mean]));
  const line = new Map(trend.trend_line.map((point) => [point.year, point.value]));
  // Insert gaps for excluded/missing years; never interpolate or invent observations.
  const observations = Array.from(
    { length: period.analyzed_end_year - period.analyzed_start_year + 1 },
    (_, i) => {
      const year = period.analyzed_start_year + i;
      return { year, value: annual.get(year) ?? null, trend: line.get(year) ?? null };
    },
  );
  return {
    location: { latitude: location.requested_latitude, longitude: location.requested_longitude },
    variable: variable.id,
    variable_name: variable.name,
    unit: variable.unit,
    trend_unit: variable.trend_unit,
    source: backend.source,
    start_year: period.analyzed_start_year,
    end_year: period.analyzed_end_year,
    observations,
    statistics: {
      // Presentation of the backend slope sign only; no new trend estimate/test.
      direction:
        trend.slope_per_decade > 0
          ? 'increasing'
          : trend.slope_per_decade < 0
            ? 'decreasing'
            : 'stable',
      rate_per_decade: trend.slope_per_decade,
      p_value: trend.p_value,
      confidence_interval: [trend.ci_lower_per_decade, trend.ci_upper_per_decade],
      confidence_level: trend.confidence_level,
      significant: trend.significant,
      observation_count: counts.annual_complete,
    },
    interpretation: backend.interpretation,
    backend,
  };
}

function matchRequest(
  analysis: Analysis & { backend: BackendTrendsResponse },
  query: AnalysisQuery,
): Analysis {
  const backend = analysis.backend;
  if (
    Math.abs(analysis.location.latitude - query.latitude) > 0.0001 ||
    Math.abs(analysis.location.longitude - query.longitude) > 0.0001 ||
    analysis.variable !== query.variable ||
    backend.period.requested_start_year !== query.start_year ||
    backend.period.requested_end_year !== query.end_year
  ) {
    throw new Error(
      'The backend returned a different location, variable, or requested period. Results were withheld.',
    );
  }
  return analysis;
}

export function parseLayers(data: unknown): LayerInfo[] {
  if (!Array.isArray(data)) return invalid('layers');
  const ids = new Set<string>();
  for (const layer of data) {
    if (
      !object(layer) ||
      !text(layer.id) ||
      ids.has(layer.id) ||
      !text(layer.name) ||
      !text(layer.category) ||
      !['trend_grid', 'imagery'].includes(layer.kind as string) ||
      !['available', 'not_built', 'planned'].includes(layer.status as string) ||
      !text(layer.description) ||
      !text(layer.source) ||
      !text(layer.limitations) ||
      !(layer.unit === null || text(layer.unit)) ||
      !(layer.trend_unit === null || text(layer.trend_unit))
    )
      return invalid('layers[]');
    if (layer.kind === 'trend_grid' && (!text(layer.unit) || !text(layer.trend_unit)))
      return invalid('layer units');
    if (layer.tiles !== null) {
      const t = layer.tiles;
      if (
        !object(t) ||
        !text(t.url_template) ||
        !text(t.projection) ||
        !text(t.time_start) ||
        !text(t.time_period) ||
        !nonnegative(t.max_zoom)
      )
        return invalid('layer tiles');
    }
    ids.add(layer.id);
  }
  return data as LayerInfo[];
}
const point = (v: unknown) =>
  object(v) && coordinate(v.latitude, 90) && coordinate(v.longitude, 180);
const nullableFinite = (v: unknown) => v === null || finite(v);
export function parseHotspots(data: unknown): HotspotsResponse {
  if (
    !object(data) ||
    !text(data.layer_id) ||
    !text(data.layer_name) ||
    !text(data.variable) ||
    !text(data.unit) ||
    !text(data.trend_unit) ||
    !text(data.method) ||
    !integer(data.period_start_year) ||
    !integer(data.period_end_year) ||
    data.period_start_year < 1900 ||
    data.period_start_year >= data.period_end_year ||
    data.period_end_year > 9999 ||
    !(data.layer_warning === null || text(data.layer_warning)) ||
    !strings(data.limitations) ||
    !Array.isArray(data.hotspots)
  )
    return invalid('hotspots');
  const p = data.parameters,
    c = data.counts;
  if (
    !object(p) ||
    !probability(p.fdr_q) ||
    p.fdr_q === 0 ||
    p.fdr_q === 1 ||
    !finite(p.magnitude_percentile) ||
    p.magnitude_percentile < 0 ||
    p.magnitude_percentile > 100 ||
    !finite(p.magnitude_threshold) ||
    p.magnitude_threshold < 0 ||
    !nonnegative(p.min_cells) ||
    p.min_cells < 1 ||
    !finite(p.robust_scale) ||
    p.robust_scale < 0 ||
    !finite(p.suspect_relative_change) ||
    p.suspect_relative_change < 0
  )
    return invalid('hotspot parameters');
  if (
    !object(c) ||
    ![
      'valid_cells',
      'fdr_significant_cells',
      'candidate_cells',
      'regions_found',
      'regions_after_min_size',
      'suspect_regions',
    ].every((k) => nonnegative(c[k])) ||
    (c.fdr_significant_cells as number) > (c.valid_cells as number) ||
    (c.candidate_cells as number) > (c.fdr_significant_cells as number) ||
    (c.regions_after_min_size as number) > (c.regions_found as number) ||
    (c.suspect_regions as number) > (c.regions_after_min_size as number) ||
    data.hotspots.length > (c.regions_after_min_size as number)
  )
    return invalid('hotspot counts');
  let rank = 0;
  for (const h of data.hotspots) {
    if (
      !object(h) ||
      !integer(h.rank) ||
      h.rank <= rank ||
      !['increase', 'decrease'].includes(h.direction as string) ||
      !nonnegative(h.n_cells) ||
      h.n_cells < p.min_cells ||
      !nonnegative(h.area_km2) ||
      h.area_km2 === 0 ||
      !finite(h.mean_slope) ||
      (h.direction === 'increase' ? h.mean_slope <= 0 : h.mean_slope >= 0) ||
      !finite(h.strength) ||
      !nonnegative(h.score) ||
      !finite(h.total_change) ||
      !nullableFinite(h.baseline_mean) ||
      !nullableFinite(h.relative_change) ||
      !['ok', 'suspect_magnitude', 'not_assessed'].includes(h.quality_flag as string) ||
      !(h.warning === null || text(h.warning)) ||
      (h.quality_flag === 'suspect_magnitude' && !text(h.warning)) ||
      !text(h.description) ||
      !point(h.centroid) ||
      !point(h.drilldown) ||
      !point(h.peak) ||
      !object(h.peak) ||
      !finite(h.peak.slope) ||
      !probability(h.peak.p_value)
    )
      return invalid('hotspots[]');
    const b = h.bounds;
    if (
      !object(b) ||
      !coordinate(b.south, 90) ||
      !coordinate(b.north, 90) ||
      !coordinate(b.west, 180) ||
      !coordinate(b.east, 180) ||
      (b.south as number) > (b.north as number) ||
      typeof b.crosses_antimeridian !== 'boolean' ||
      (b.crosses_antimeridian
        ? (b.west as number) <= (b.east as number)
        : (b.west as number) > (b.east as number))
    )
      return invalid('hotspot bounds');
    rank = h.rank;
  }
  return data as unknown as HotspotsResponse;
}

export function createApiClient(baseUrl: string = BASE_URL, fetcher: typeof fetch = fetch) {
  const base = baseUrl.replace(/\/$/, '');
  async function get(path: string, signal?: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const response = await fetcher(`${base}${path}`, {
        signal: requestSignal,
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      let data: unknown;
      try {
        data = await response.json();
      } catch (error) {
        if (requestSignal.aborted) throw error;
        throw new Error(
          `Backend returned invalid JSON for ${path.split('?')[0]} (HTTP ${response.status}).`,
        );
      }
      if (!response.ok) {
        // FastAPI returns string details for insufficient data/upstream failures,
        // or structured validation issues. Render only explicit messages as text.
        let detail = '';
        if (object(data) && typeof data.detail === 'string') detail = data.detail;
        else if (object(data) && Array.isArray(data.detail))
          detail = data.detail
            .filter(object)
            .filter((issue) => typeof issue.msg === 'string')
            .map((issue) => issue.msg)
            .join('; ');
        throw new Error(
          `Backend request to ${path.split('?')[0]} failed (HTTP ${response.status}). ${detail || 'Check the backend and retry.'}`,
        );
      }
      return data;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (timeout.aborted || (error instanceof Error && error.name === 'TimeoutError'))
        throw new Error('The backend did not respond within 45 seconds. Retry the request.');
      if (error instanceof TypeError)
        throw new Error(
          `Unable to reach ${base}. Check that FastAPI is running, NEXT_PUBLIC_API_BASE_URL is correct, and CORS permits this frontend origin.`,
        );
      throw error;
    }
  }
  return {
    layers: async (signal?: AbortSignal) => parseLayers(await get('/api/layers', signal)),
    hotspots: async (query: HotspotsQuery, signal?: AbortSignal) => {
      if (
        !['both', 'increase', 'decrease'].includes(query.direction) ||
        !integer(query.limit) ||
        query.limit < 1 ||
        query.limit > 50 ||
        !text(query.layer_id)
      )
        throw new Error('Invalid hotspot query.');
      const params = new URLSearchParams({
        layer_id: query.layer_id,
        direction: query.direction,
        limit: String(query.limit),
      });
      const result = parseHotspots(await get(`/api/detective/hotspots?${params}`, signal));
      if (
        result.layer_id !== query.layer_id ||
        result.hotspots.length > query.limit ||
        (query.direction !== 'both' && result.hotspots.some((h) => h.direction !== query.direction))
      )
        return invalid('hotspot request match');
      return result;
    },
    health: async (signal?: AbortSignal) => parseHealth(await get('/api/health', signal)),
    variables: async (signal?: AbortSignal) => parseVariables(await get('/api/variables', signal)),
    trends: async (query: AnalysisQuery, signal?: AbortSignal) => {
      const params = new URLSearchParams(
        Object.entries(query).map(([key, value]) => [key, String(value)]),
      );
      return matchRequest(parseAnalysis(await get(`/api/trends?${params}`, signal)), query);
    },
  };
}
export const api = createApiClient();
