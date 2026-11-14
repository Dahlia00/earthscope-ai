import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Compass } from 'lucide-react';
import type { Hotspot, HotspotsResponse, LayerInfo } from '@/lib/types';
import { displayUnit } from '@/lib/units';
import { buildDrilldownHref } from '@/lib/detective';
const format = (n: number) =>
  n === 0 ? '0' : Math.abs(n) < 0.01 ? n.toPrecision(3) : n.toFixed(2);
export function DiscoveryCard({
  hotspot: h,
  response: r,
  layer,
  canDrilldown,
}: {
  hotspot: Hotspot;
  response: HotspotsResponse;
  layer: LayerInfo;
  canDrilldown: boolean;
}) {
  const caution = Boolean(r.layer_warning) || h.quality_flag === 'suspect_magnitude';
  return (
    <article className={`discovery-card ${h.direction}`} aria-label="Selected hotspot evidence">
      <div className="discovery-card-top">
        <span>SELECTED LEAD · REGION {h.rank}</span>
        <Compass size={21} />
      </div>
      <h2>
        {h.direction === 'increase' ? 'Increasing' : 'Decreasing'} {r.layer_name.toLowerCase()}
      </h2>
      <p className="region-coordinates">
        Centroid {h.centroid.latitude}°, {h.centroid.longitude}°
      </p>
      <div className="discovery-rate">
        {h.mean_slope > 0 ? '+' : ''}
        {format(h.mean_slope)} <small>{displayUnit(r.trend_unit)}</small>
      </div>
      <p className="detective-muted">
        Area-weighted regional mean · {r.period_start_year}–{r.period_end_year}
      </p>
      <dl className="discovery-metrics">
        <div>
          <dt>Area</dt>
          <dd>{h.area_km2.toLocaleString('en-US')} km²</dd>
        </div>
        <div>
          <dt>Grid cells</dt>
          <dd>{h.n_cells.toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt>Period change</dt>
          <dd>
            {h.total_change > 0 ? '+' : ''}
            {format(h.total_change)} {displayUnit(r.unit)}
          </dd>
        </div>
        <div>
          <dt>Quality flag</dt>
          <dd>{h.quality_flag.replaceAll('_', ' ')}</dd>
        </div>
      </dl>
      {h.warning && (
        <p className="detective-warning">
          <AlertTriangle size={16} />
          {h.warning}
        </p>
      )}
      {caution && (
        <p className="detective-warning">
          Unresolved data-quality concerns: treat this lead as a diagnostic, not a reliable climate
          finding.
        </p>
      )}
      {h.quality_flag === 'not_assessed' && (
        <p className="detective-muted">
          Magnitude plausibility was not assessed. This flag is not a quality endorsement.
        </p>
      )}
      <p className="backend-description">{h.description}</p>
      <p className="detective-muted">
        Point investigation uses the backend’s drilldown coordinate ({h.drilldown.latitude},{' '}
        {h.drilldown.longitude}), not the regional mean. Review regional cautions alongside the
        point result.
      </p>
      {canDrilldown ? (
        <Link className="button primary drilldown-link" href={buildDrilldownHref(r, h)}>
          {caution ? 'Inspect with caution' : 'Investigate this location'}
          <ArrowUpRight size={16} />
        </Link>
      ) : (
        <p className="detective-warning">
          Point analysis for {r.variable} is not advertised by /api/variables. Regional evidence
          remains available below.
        </p>
      )}
      <details>
        <summary>Scientific evidence & limitations</summary>
        <dl className="discovery-details">
          <dt>Source</dt>
          <dd>{layer.source}</dd>
          <dt>Detection method</dt>
          <dd>{r.method}</dd>
          <dt>Peak cell (not a region-wide p-value)</dt>
          <dd>
            {h.peak.latitude}, {h.peak.longitude} · slope {h.peak.slope} {displayUnit(r.trend_unit)}{' '}
            · raw p = {h.peak.p_value} (returned precision)
          </dd>
          <dt>Region bounds</dt>
          <dd>
            {h.bounds.south}° to {h.bounds.north}° latitude; {h.bounds.west}° to {h.bounds.east}°
            longitude{h.bounds.crosses_antimeridian ? ' · crosses the antimeridian' : ''}
          </dd>
          <dt>Baseline mean / relative change</dt>
          <dd>
            {h.baseline_mean ?? 'Unavailable'} / {h.relative_change ?? 'Not defined'}
          </dd>
          <dt>Robust strength / ranking score</dt>
          <dd>
            {h.strength} / {h.score}
          </dd>
          <dt>Selection criteria</dt>
          <dd>
            FDR q={r.parameters.fdr_q}; magnitude percentile {r.parameters.magnitude_percentile};
            threshold {r.parameters.magnitude_threshold} {displayUnit(r.trend_unit)}; minimum{' '}
            {r.parameters.min_cells} cells; robust scale {r.parameters.robust_scale}; suspect
            relative change threshold {r.parameters.suspect_relative_change}
          </dd>
        </dl>
        <p>{layer.limitations}</p>
        <ul>
          {r.limitations.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </details>
    </article>
  );
}
