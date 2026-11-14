'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertCircle,
  ArrowRight,
  Crosshair,
  FlaskConical,
  LoaderCircle,
  MapPin,
  Radio,
  RotateCcw,
  Thermometer,
} from 'lucide-react';
import {
  DEFAULT_QUERY,
  TEMPERATURE,
  type Analysis,
  type AnalysisQuery,
  type Variable,
} from '@/lib/types';
import { api } from '@/lib/api';
import { MOCK_ANALYSIS } from '@/data/mock-analysis';
import { TrendChart } from '@/components/charts/TrendChart';
import { TrendSummary } from '@/components/insights/TrendSummary';
import { ScientificEvidence } from '@/components/insights/ScientificEvidence';
import { displayUnit } from '@/lib/units';
const LocationMap = dynamic(() => import('./LocationMap'), {
  ssr: false,
  loading: () => <div className="map-frame map-loading">Loading interactive map…</div>,
});
export function Explorer({
  initialQuery,
  detectiveCaution = false,
}: {
  initialQuery?: AnalysisQuery;
  detectiveCaution?: boolean;
}) {
  const [mode, setMode] = useState<'demo' | 'live'>(initialQuery ? 'live' : 'demo');
  const [query, setQuery] = useState<AnalysisQuery>(initialQuery ?? DEFAULT_QUERY);
  const [latitude, setLatitude] = useState(String((initialQuery ?? DEFAULT_QUERY).latitude));
  const [longitude, setLongitude] = useState(String((initialQuery ?? DEFAULT_QUERY).longitude));
  const [analysis, setAnalysis] = useState<Analysis | null>(initialQuery ? null : MOCK_ANALYSIS);
  const [variables, setVariables] = useState<Variable[]>(initialQuery ? [] : [TEMPERATURE]);
  const [connection, setConnection] = useState('Not connected');
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const autoStart = useRef(Boolean(initialQuery));
  const selectedVariable = variables.find((v) => v.id === query.variable);
  const minYear =
    mode === 'live' ? (selectedVariable?.metadata?.coverage_start_year ?? 1981) : 1900;
  const maxYear = mode === 'live' ? new Date().getUTCFullYear() : 2025;
  useEffect(() => {
    if (mode !== 'live') return;
    const controller = new AbortController();
    Promise.all([api.health(controller.signal), api.variables(controller.signal)])
      .then(([, supported]) => {
        if (controller.signal.aborted) return;
        setVariables(supported);
        setReady(supported.length > 0);
        setConnection(supported.length ? 'Backend connected' : 'No variables supported');
        if (supported.length)
          setQuery((current) =>
            supported.some((v) => v.id === current.variable)
              ? current
              : { ...current, variable: supported[0].id },
          );
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setReady(false);
          setConnection('Backend unavailable');
          setError(
            error instanceof Error
              ? error.message
              : 'Cannot connect to the backend. Check the API URL and CORS settings.',
          );
        }
      });
    return () => controller.abort();
  }, [mode, connectionAttempt]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!initialQuery || !ready || mode !== 'live' || !autoStart.current) return;
    const controller = new AbortController();
    request.current = controller;
    Promise.resolve().then(() => {
      if (!controller.signal.aborted) setLoading(true);
    });
    api
      .trends(initialQuery, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          autoStart.current = false;
          setAnalysis(result);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          autoStart.current = false;
          setError(error instanceof Error ? error.message : 'Point analysis failed.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [initialQuery, ready, mode]);
  function invalidate() {
    autoStart.current = false;
    request.current?.abort();
    setLoading(false);
    setAnalysis(null);
    setError('');
  }
  function update(patch: Partial<AnalysisQuery>) {
    invalidate();
    setQuery((q) => ({ ...q, ...patch }));
  }
  function selectLocation(lat: number, lon: number) {
    setLatitude(String(lat));
    setLongitude(String(lon));
    update({ latitude: lat, longitude: lon });
  }
  function switchMode(next: 'demo' | 'live') {
    if (next === mode) return;
    invalidate();
    setMode(next);
    setReady(false);
    setConnection('Connecting…');
    setVariables(next === 'demo' ? [TEMPERATURE] : []);
    if (next === 'demo') setQuery((q) => ({ ...q, variable: 'T2M' }));
  }
  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    invalidate();
    const lat = Number(latitude),
      lon = Number(longitude);
    if (
      !latitude.trim() ||
      !longitude.trim() ||
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      !Number.isFinite(lon) ||
      lon < -180 ||
      lon > 180 ||
      !Number.isInteger(query.start_year) ||
      !Number.isInteger(query.end_year) ||
      query.start_year > query.end_year ||
      query.start_year < minYear ||
      query.end_year > maxYear
    ) {
      setError(
        `Enter valid coordinates and a year range between ${minYear} and ${maxYear}, with the start year no later than the end year.`,
      );
      return;
    }
    const selection = { ...query, latitude: lat, longitude: lon };
    setQuery(selection);
    if (mode === 'demo') {
      if (
        lat !== DEFAULT_QUERY.latitude ||
        lon !== DEFAULT_QUERY.longitude ||
        query.variable !== 'T2M' ||
        query.start_year !== 1990 ||
        query.end_year !== 2025
      ) {
        setError(
          'The fictional demo is available only for Ottawa, 1990–2025. Restore the demo selection below, or use Live API for another investigation.',
        );
        return;
      }
      setAnalysis(MOCK_ANALYSIS);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const result = await api.trends(selection, controller.signal);
      if (!controller.signal.aborted) {
        setAnalysis(result);
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error && e.name !== 'TypeError'
            ? e.message
            : 'Unable to reach the backend. Check that FastAPI is running and permits requests from this frontend.',
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  function retryConnection() {
    invalidate();
    setReady(false);
    setVariables([]);
    setConnection('Connecting…');
    setConnectionAttempt((attempt) => attempt + 1);
  }
  function restore() {
    invalidate();
    setQuery(DEFAULT_QUERY);
    setLatitude(String(DEFAULT_QUERY.latitude));
    setLongitude(String(DEFAULT_QUERY.longitude));
  }
  const validMap =
    latitude.trim() &&
    longitude.trim() &&
    Number.isFinite(Number(latitude)) &&
    Math.abs(Number(latitude)) <= 90 &&
    Number.isFinite(Number(longitude)) &&
    Math.abs(Number(longitude)) <= 180;
  return (
    <main id="main" className="explorer section-wrap">
      <div className="explorer-heading">
        <div>
          <div className="eyebrow">
            <span className="status-dot" /> YOUR PLANET. YOUR INVESTIGATION.
          </div>
          <h1>
            Earth Explorer<span>.</span>
          </h1>
          <p>Pick a place. Follow the data. Discover the change.</p>
        </div>
        <div className="mode-switch" aria-label="Data mode">
          <button
            aria-pressed={mode === 'demo'}
            className={mode === 'demo' ? 'selected' : ''}
            onClick={() => switchMode('demo')}
          >
            <FlaskConical size={15} /> Demo data
          </button>
          <button
            aria-pressed={mode === 'live'}
            className={mode === 'live' ? 'selected' : ''}
            onClick={() => switchMode('live')}
          >
            <Radio size={15} /> Live API
          </button>
        </div>
      </div>
      <div className={`mode-notice ${mode === 'live' ? 'live-notice' : ''}`} role="status">
        <FlaskConical size={17} />
        {mode === 'demo' ? (
          <span>
            <strong>You’re exploring demo data.</strong> All observations and statistics are
            fictional. Sample: Ottawa, 1990–2025.
          </span>
        ) : (
          <span>
            <strong>{connection}.</strong> Validated FastAPI responses. No demo fallback.
          </span>
        )}
      </div>
      {initialQuery && (
        <p className="mode-notice" role="status">
          Opened from Earth Detective. This analysis describes one source grid cell, not the
          hotspot’s regional mean. Review regional quality warnings in Earth Detective alongside the
          point result.
        </p>
      )}
      {detectiveCaution && (
        <p className="evidence-warning" role="alert">
          This Earth Detective link carries a regional data-quality caution. A point result does not
          resolve those concerns or establish that the regional trend is reliable.
        </p>
      )}
      <div className="explorer-layout">
        <aside className="panel controls">
          <div className="panel-heading">
            <h2>
              <Crosshair size={18} /> Set your coordinates
            </h2>
            <span className="step-label">01</span>
          </div>
          <LocationMap
            latitude={validMap ? Number(latitude) : query.latitude}
            longitude={validMap ? Number(longitude) : query.longitude}
            onSelect={selectLocation}
          />
          <form onSubmit={analyze}>
            <div className="location-title">
              <MapPin size={15} />
              {Number(latitude) === 45.4215 && Number(longitude) === -75.6972
                ? 'Ottawa, Canada'
                : 'Selected coordinates'}
              <button
                type="button"
                className="icon-button"
                onClick={restore}
                aria-label="Restore Ottawa demo selection"
                title="Restore Ottawa demo selection"
              >
                <RotateCcw size={14} />
              </button>
            </div>
            <div className="input-pair">
              <label>
                Latitude
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  required
                  value={latitude}
                  onChange={(e) => {
                    setLatitude(e.target.value);
                    invalidate();
                  }}
                />
              </label>
              <label>
                Longitude
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  required
                  value={longitude}
                  onChange={(e) => {
                    setLongitude(e.target.value);
                    invalidate();
                  }}
                />
              </label>
            </div>
            <div className="control-divider" />
            <label className="variable-label">
              <span>
                <Thermometer size={15} /> Environmental variable
              </span>
              <select
                value={query.variable}
                disabled={mode === 'live' && !ready}
                onChange={(e) => update({ variable: e.target.value })}
              >
                {variables.length ? (
                  variables.map((v) => (
                    <option value={v.id} key={v.id}>
                      {v.label} ({displayUnit(v.unit)})
                    </option>
                  ))
                ) : (
                  <option value="T2M">Temperature — awaiting backend</option>
                )}
              </select>
            </label>
            <div className="field-label">Observation period</div>
            <div className="input-pair">
              <label>
                Start year
                <input
                  type="number"
                  required
                  min={minYear}
                  max={maxYear}
                  value={query.start_year}
                  onChange={(e) => update({ start_year: Number(e.target.value) })}
                />
              </label>
              <label>
                End year
                <input
                  type="number"
                  required
                  min={minYear}
                  max={maxYear}
                  value={query.end_year}
                  onChange={(e) => update({ end_year: Number(e.target.value) })}
                />
              </label>
            </div>
            <button
              className="button primary analyze-button"
              disabled={loading || (mode === 'live' && !ready)}
              type="submit"
            >
              {loading ? <LoaderCircle className="spin" size={17} /> : <ScanIcon />}
              {loading ? 'Analyzing location…' : 'Analyze Location'}
              {!loading && <ArrowRight size={16} />}
            </button>
            <p className="controls-note">
              {mode === 'demo'
                ? 'Demo supports Ottawa · 1990–2025 only.'
                : 'Scientific calculations are provided by the backend; at least 10 complete years are required.'}
            </p>
          </form>
        </aside>
        <div className="results" aria-live="polite" aria-busy={loading}>
          {error && (
            <div className="error-message" role="alert">
              <AlertCircle size={20} />
              <div>
                <strong>Investigation needs attention</strong>
                <p>{error}</p>
                {mode === 'demo' ? (
                  <button className="text-button" onClick={restore}>
                    Restore Ottawa demo selection
                  </button>
                ) : (
                  !ready && (
                    <button className="text-button" onClick={retryConnection}>
                      Retry backend connection
                    </button>
                  )
                )}
              </div>
            </div>
          )}
          {loading ? (
            <div className="panel empty-state">
              <LoaderCircle size={30} className="spin" />
              <h2>Following the data…</h2>
              <p>Requesting observations and trend results from the backend.</p>
            </div>
          ) : analysis ? (
            <>
              <TrendChart analysis={analysis} demo={mode === 'demo'} />
              <TrendSummary analysis={analysis} demo={mode === 'demo'} />
              {analysis.backend && (
                <ScientificEvidence
                  backend={analysis.backend}
                  variable={selectedVariable?.metadata}
                />
              )}
            </>
          ) : (
            <div className="panel empty-state">
              <Crosshair size={38} />
              <span className="eyebrow">EVERY DISCOVERY STARTS SOMEWHERE</span>
              <h2>Your next investigation awaits.</h2>
              <p>Choose your location and period, then select Analyze Location.</p>
              {mode === 'demo' && (
                <button className="button secondary" onClick={restore}>
                  Use Ottawa demo <ArrowRight size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
function ScanIcon() {
  return <Crosshair size={17} />;
}
