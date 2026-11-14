import { AlertTriangle, Database } from 'lucide-react';
import type { BackendTrendsResponse, BackendVariable } from '@/lib/types';
import { displayUnit } from '@/lib/units';

export function ScientificEvidence({
  backend: b,
  variable,
}: {
  backend: BackendTrendsResponse;
  variable?: BackendVariable;
}) {
  return (
    <section className="panel evidence-panel" aria-label="Scientific evidence">
      <div className="panel-heading">
        <h2>
          <Database size={17} /> Scientific evidence
        </h2>
        <span className={`origin-badge ${b.data_origin === 'snapshot' ? 'snapshot' : ''}`}>
          {b.data_origin === 'live' ? 'Live NASA response' : 'Saved NASA snapshot'}
        </span>
      </div>
      <div className="evidence-content">
        {b.data_origin === 'snapshot' && (
          <p className="evidence-warning" role="status">
            NASA was unreachable. The backend used an exact-match saved real NASA response retrieved
            at {b.retrieved_at}. This is historical NASA data, not fictional demo data or a fresh
            upstream retrieval.
          </p>
        )}
        {b.trend.autocorrelation_flag && (
          <p className="evidence-warning">
            <AlertTriangle size={17} /> Backend autocorrelation flag: lag-1 r ={' '}
            {b.trend.lag1_autocorrelation.toPrecision(4)}. The backend cautions that p-values may
            overstate significance.
          </p>
        )}
        {b.warnings.length > 0 && (
          <div className="evidence-warning" role="status">
            <strong>Backend data-quality warnings</strong>
            <ul>
              {b.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
        <dl className="evidence-grid">
          <div>
            <dt>Data source</dt>
            <dd>{b.source}</dd>
          </div>
          <div>
            <dt>Origin / retrieved at</dt>
            <dd>
              {b.data_origin} · <time dateTime={b.retrieved_at}>{b.retrieved_at}</time>
            </dd>
          </div>
          <div>
            <dt>Requested point</dt>
            <dd>
              {b.location.requested_latitude}, {b.location.requested_longitude}
            </dd>
          </div>
          <div>
            <dt>MERRA-2 cell centre</dt>
            <dd>
              {b.location.cell_latitude}, {b.location.cell_longitude} · elevation{' '}
              {b.location.elevation_m === null ? 'unavailable' : `${b.location.elevation_m} m`}
            </dd>
          </div>
          <div>
            <dt>Requested / analyzed period</dt>
            <dd>
              {b.period.requested_start_year}–{b.period.requested_end_year} /{' '}
              {b.period.analyzed_start_year}–{b.period.analyzed_end_year}
            </dd>
          </div>
          <div>
            <dt>Variable / units</dt>
            <dd>
              {b.variable.name} ({b.variable.id}) · {displayUnit(b.variable.unit)} · trend{' '}
              {displayUnit(b.variable.trend_unit)}
            </dd>
          </div>
          <div>
            <dt>Monthly observations (backend counts)</dt>
            <dd>
              {b.counts.monthly_valid} valid · {b.counts.monthly_missing} flagged missing
            </dd>
          </div>
          <div>
            <dt>Complete years / excluded incomplete years</dt>
            <dd>
              {b.counts.annual_complete} /{' '}
              {b.counts.incomplete_years_excluded.length
                ? b.counts.incomplete_years_excluded.join(', ')
                : 'None reported'}
            </dd>
          </div>
          <div>
            <dt>Trend methodology</dt>
            <dd>{b.trend.method}</dd>
          </div>
          <div>
            <dt>Statistical criteria</dt>
            <dd>
              Confidence level {b.trend.confidence_level} · significance level{' '}
              {b.trend.significance_level}
            </dd>
          </div>
          {variable && (
            <div className="evidence-wide">
              <dt>Annual aggregation</dt>
              <dd>{variable.aggregation}</dd>
            </div>
          )}
        </dl>
        <details>
          <summary>Diagnostics and limitations</summary>
          <dl className="evidence-grid">
            <div>
              <dt>Mann–Kendall S / z</dt>
              <dd>
                {b.trend.mann_kendall_s} / {b.trend.mann_kendall_z}
              </dd>
            </div>
            <div>
              <dt>Residual lag-1 autocorrelation / flag</dt>
              <dd>
                {b.trend.lag1_autocorrelation} / {String(b.trend.autocorrelation_flag)}
              </dd>
            </div>
          </dl>
          <ul>
            {b.limitations.map((limitation, i) => (
              <li key={i}>{limitation}</li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
