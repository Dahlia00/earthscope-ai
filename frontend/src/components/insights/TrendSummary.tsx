import { ArrowUpRight, ArrowDownRight, Info, MoveRight } from 'lucide-react';
import type { Analysis } from '@/lib/types';
import { displayUnit } from '@/lib/units';
export function TrendSummary({ analysis, demo }: { analysis: Analysis; demo: boolean }) {
  const s = analysis.statistics;
  const trendUnit = displayUnit(analysis.trend_unit ?? `${analysis.unit} / decade`);
  const confidence = Math.round((s.confidence_level ?? 0.95) * 100);
  const number = (v: number | null) =>
    v === null ? 'Unavailable' : v !== 0 && Math.abs(v) < 0.01 ? v.toPrecision(3) : v.toFixed(2);
  return (
    <section className="insights" aria-label="Scientific insights">
      <div className="insights-heading">
        <h2>What the data tells us</h2>
        <span className="eyebrow">{demo ? 'FICTIONAL DEMO RESULTS' : 'BACKEND ANALYSIS'}</span>
      </div>
      <div className="stat-grid">
        <article className="panel stat">
          <span>Rate of change</span>
          <div className="stat-number">
            {s.rate_per_decade !== null && s.rate_per_decade > 0 ? '+' : ''}
            {number(s.rate_per_decade)}
            <small>{trendUnit}</small>
          </div>
          <div className="stat-foot">
            {s.direction === 'decreasing' ? (
              <ArrowDownRight size={15} />
            ) : s.direction === 'increasing' ? (
              <ArrowUpRight size={15} />
            ) : (
              <MoveRight size={15} />
            )}
            {s.direction
              ? `${s.direction[0].toUpperCase()}${s.direction.slice(1)} trend`
              : 'Direction unavailable'}
          </div>
        </article>
        <article className="panel stat">
          <span>Statistical significance</span>
          <div className="significance">
            {s.significant === null
              ? 'Not determined'
              : s.significant
                ? 'Significant'
                : 'Not significant'}
            {s.significant !== null && (
              <span className={`result-dot ${s.significant ? '' : 'neutral'}`} />
            )}
          </div>
          <div className="stat-foot">
            p-value <strong>{s.p_value === null ? 'Unavailable' : s.p_value.toPrecision(3)}</strong>
          </div>
        </article>
        <article className="panel stat">
          <span>{confidence}% confidence interval</span>
          <div className="ci-number">
            {s.confidence_interval ? (
              <>
                {number(s.confidence_interval[0])} <MoveRight size={17} />{' '}
                {number(s.confidence_interval[1])}
              </>
            ) : (
              'Unavailable'
            )}
          </div>
          <div className="stat-foot">
            {trendUnit} · {s.observation_count} annual observations
          </div>
        </article>
      </div>
      <article className="interpretation">
        <span className="interpretation-icon">
          <Info size={20} />
        </span>
        <div>
          <h3>{demo ? 'Reading this fictional example' : 'Making sense of the results'}</h3>
          <p>
            {analysis.interpretation ||
              'The backend did not return an interpretation. Statistical results may be unavailable when there are insufficient observations.'}
          </p>
        </div>
      </article>
      <details className="science-notes">
        <summary>A quick guide to the science</summary>
        <div>
          <p>
            <strong>Trend:</strong> the estimated direction and rate of change over the selected
            period, calculated by the backend.
          </p>
          <p>
            <strong>p-value:</strong> under a no-trend model and its assumptions, the probability of
            a result at least as extreme as the one observed. It is not the probability that the
            trend is real.
          </p>
          <p>
            <strong>Confidence interval:</strong> a range produced by a method that would contain
            the true trend in 95% of repeated samples under its assumptions.
          </p>
          <p>
            <strong>Statistical significance:</strong> reported only when the backend supplies a
            decision. It does not establish causation or tell us how scientifically important a
            change is.
          </p>
        </div>
      </details>
    </section>
  );
}
