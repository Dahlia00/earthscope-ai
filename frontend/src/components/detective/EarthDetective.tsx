'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Compass,
  LoaderCircle,
  Search,
} from 'lucide-react';
import { api } from '@/lib/api';
import { displayUnit } from '@/lib/units';
import type { HotspotsQuery, HotspotsResponse, LayerInfo, Variable } from '@/lib/types';
import { DetectiveGlobe } from './DetectiveGlobe';
import { DiscoveryCard } from './DiscoveryCard';

export function EarthDetective() {
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [query, setQuery] = useState<HotspotsQuery>({
    layer_id: 'temperature_trend',
    direction: 'both',
    limit: 10,
  });
  const [result, setResult] = useState<HotspotsResponse | null>(null);
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [catalogReady, setCatalogReady] = useState(false);
  const [error, setError] = useState('');
  const [variableError, setVariableError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api
      .layers(controller.signal)
      .then((catalog) => {
        if (controller.signal.aborted) return;
        setLayers(catalog);
        setCatalogReady(true);
        const built = catalog.filter((l) => l.kind === 'trend_grid' && l.status === 'available');
        if (built.length)
          setQuery((q) =>
            built.some((l) => l.id === q.layer_id) ? q : { ...q, layer_id: built[0].id },
          );
        else {
          setLoading(false);
          setError(
            'No built trend layers are available. Imagery and planned layers cannot supply hotspot statistics.',
          );
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setError(e instanceof Error ? e.message : 'Cannot retrieve layer catalog.');
        }
      });
    api
      .variables(controller.signal)
      .then((v) => {
        if (!controller.signal.aborted) {
          setVariables(v);
          setVariableError('');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setVariableError(
            'Point-variable discovery is unavailable. Drilldown is disabled until it can be verified.',
          );
      });
    return () => controller.abort();
  }, [attempt]);
  const layer = layers.find((l) => l.id === query.layer_id);
  useEffect(() => {
    if (!catalogReady || !layer || layer.kind !== 'trend_grid' || layer.status !== 'available')
      return;
    const controller = new AbortController();
    api
      .hotspots(query, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.unit !== layer.unit || data.trend_unit !== layer.trend_unit)
          throw new Error('Hotspot units differ from the selected layer. Results withheld.');
        setResult(data);
        setSelectedRank(data.hotspots[0]?.rank ?? null);
        setLoading(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setResult(null);
          setLoading(false);
          setError(e instanceof Error ? e.message : 'Hotspot request failed.');
        }
      });
    return () => controller.abort();
  }, [query, catalogReady, layer, attempt]);
  function change(patch: Partial<HotspotsQuery>) {
    setResult(null);
    setSelectedRank(null);
    setSelectionVersion(0);
    setError('');
    setLoading(true);
    setQuery((q) => ({ ...q, ...patch }));
  }
  function retry() {
    setError('');
    setVariables([]);
    setVariableError('');
    setResult(null);
    setSelectedRank(null);
    setSelectionVersion(0);
    setLoading(true);
    setCatalogReady(false);
    setAttempt((n) => n + 1);
  }
  function select(rank: number) {
    setSelectedRank(rank);
    setSelectionVersion((n) => n + 1);
  }
  const selected = result?.hotspots.find((h) => h.rank === selectedRank);
  return (
    <main id="main" className="detective-page">
      <div className="detective-title">
        <span className="detective-title-icon">
          <Search size={30} />
        </span>
        <div>
          <div className="eyebrow">FOLLOW A LEAD. EXAMINE THE EVIDENCE.</div>
          <h1>
            Earth <em>Detective</em>
          </h1>
          <p>Discover Earth’s hidden contrasts — one scientifically detected region at a time.</p>
        </div>
        <Link className="button secondary" href="/explore">
          Coordinate explorer <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="detective-controls panel">
        <label>
          Environmental trend layer
          <select
            value={query.layer_id}
            disabled={!catalogReady || !layers.length}
            onChange={(e) => change({ layer_id: e.target.value })}
          >
            {layers.length ? (
              layers.map((l) => (
                <option
                  key={l.id}
                  value={l.id}
                  disabled={l.kind !== 'trend_grid' || l.status !== 'available'}
                >
                  {l.name}
                  {l.kind !== 'trend_grid'
                    ? ' · imagery only'
                    : l.status !== 'available'
                      ? ` · ${l.status}`
                      : ''}
                </option>
              ))
            ) : (
              <option value="temperature_trend">Loading supported layers…</option>
            )}
          </select>
        </label>
        <label>
          Trend direction
          <select
            value={query.direction}
            onChange={(e) => change({ direction: e.target.value as HotspotsQuery['direction'] })}
          >
            <option value="both">Increases & decreases</option>
            <option value="increase">Increasing trends</option>
            <option value="decrease">Decreasing trends</option>
          </select>
        </label>
        <div className="detective-period">
          <span>Backend grid period</span>
          <strong>
            {result
              ? `${result.period_start_year}–${result.period_end_year}`
              : 'Returned with results'}
          </strong>
          <small>Precomputed analysis · top {query.limit} ranked leads</small>
        </div>
        <button className="button secondary" onClick={retry} disabled={loading}>
          <Compass size={16} /> Refresh evidence
        </button>
      </div>
      <p className="detective-intro">
        Hotspots are leads to investigate, not established findings or proof of causes. Markers show
        returned regional centroids; point drilldown investigates one grid cell.
      </p>
      {result?.layer_warning && (
        <div className="detective-warning layer-warning" role="alert">
          <AlertTriangle size={24} />
          <div>
            <strong>Layer-wide data-quality warning — reliability unresolved</strong>
            <p>{result.layer_warning}</p>
          </div>
        </div>
      )}
      {variableError && (
        <p className="detective-warning" role="status">
          {variableError}
        </p>
      )}
      {error && (
        <div className="error-message" role="alert">
          <AlertTriangle size={19} />
          <div>
            <strong>Discovery request failed</strong>
            <p>{error}</p>
            <button className="text-button" onClick={retry}>
              Retry discovery
            </button>
          </div>
        </div>
      )}
      <div className="detective-workspace">
        <section className="detective-map-panel panel" aria-label="Interactive hotspot globe">
          <div className="detective-panel-heading">
            <h2>{layer?.name ?? 'Earth trend regions'}</h2>
            <span className="detective-legend">
              <span className="increase">↑ Increase</span>
              <span className="decrease">↓ Decrease</span>
              <span className="caution">Amber border: caution</span>
            </span>
          </div>
          <DetectiveGlobe
            key={`${query.layer_id}-${query.direction}`}
            hotspots={result?.hotspots ?? []}
            selectedRank={selectedRank}
            selectionVersion={selectionVersion}
            caution={Boolean(result?.layer_warning)}
            onSelect={select}
          />
          {loading && (
            <div className="detective-loading" role="status">
              <LoaderCircle className="spin" size={20} /> Loading backend evidence…
            </div>
          )}
          <div className="detective-map-caption">
            Historical Earth imagery is decorative. Hotspot coordinates and metrics come from the
            backend. Earth textures:{' '}
            <a href="https://www.solarsystemscope.com/textures/">Solar System Scope</a> · CC BY 4.0.
          </div>
        </section>
        <aside className="detective-region-list panel">
          <div className="detective-panel-heading">
            <h2>Detected regions</h2>
            <span>{result?.hotspots.length ?? 0} shown</span>
          </div>
          {!loading && result?.hotspots.length === 0 && (
            <p className="detective-empty">
              No regions met the backend’s criteria for this direction. Try another direction or
              layer.
            </p>
          )}
          {!result && (
            <p className="detective-empty">
              {loading
                ? 'Retrieving actual backend hotspots…'
                : 'No results. Retry the request above.'}
            </p>
          )}
          {result?.hotspots.map((h) => (
            <button
              type="button"
              key={h.rank}
              className={`region-item ${selectedRank === h.rank ? 'selected' : ''} ${h.direction}`}
              aria-pressed={selectedRank === h.rank}
              onClick={() => select(h.rank)}
            >
              <span className="region-rank">
                {h.direction === 'increase' ? (
                  <ArrowUpRight size={17} />
                ) : (
                  <ArrowDownRight size={17} />
                )}{' '}
                {h.rank}
              </span>
              <span>
                <strong>Region {h.rank}</strong>
                <small>
                  {h.centroid.latitude}°, {h.centroid.longitude}°
                </small>
                <small>{h.area_km2.toLocaleString('en-US')} km²</small>
              </span>
              <span className="region-slope">
                {h.mean_slope > 0 ? '+' : ''}
                {h.mean_slope.toPrecision(3)}
                <small>{displayUnit(result.trend_unit)}</small>
                {(result.layer_warning || h.quality_flag === 'suspect_magnitude') && (
                  <small className="caution">⚠ Caution</small>
                )}
              </span>
            </button>
          ))}
        </aside>
      </div>
      {result && selected && layer && (
        <DiscoveryCard
          hotspot={selected}
          response={result}
          layer={layer}
          canDrilldown={variables.some((v) => v.id === result.variable)}
        />
      )}
      {result && (
        <div className="detective-method">
          <h2>How these leads were selected</h2>
          <p>{result.method}</p>
          <p>
            {result.counts.valid_cells.toLocaleString('en-US')} valid cells →{' '}
            {result.counts.fdr_significant_cells.toLocaleString('en-US')} FDR-significant cells →{' '}
            {result.counts.candidate_cells.toLocaleString('en-US')} candidates →{' '}
            {result.counts.regions_after_min_size} regions after minimum size.{' '}
            {result.counts.suspect_regions} regions flagged suspect. Displaying only the requested
            top {query.limit}.
          </p>
          <p>{result.limitations[0]}</p>
        </div>
      )}
    </main>
  );
}
