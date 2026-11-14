'use client';
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { Pause, Play } from 'lucide-react';
import { useMotionPreference } from '@/components/landing/useMotionPreference';
import type { Hotspot } from '@/lib/types';
const Scene = dynamic(() => import('./DetectiveScene'), {
  ssr: false,
  loading: () => <p className="globe-status">Loading 3D Earth…</p>,
});
function Fallback() {
  return (
    <div className="detective-fallback">
      <Image src="/textures/earth-still.webp" alt="Static Earth preview" width={320} height={320} />
      <p>3D Earth unavailable. Select any region from the list to investigate.</p>
    </div>
  );
}
class Boundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}
export function DetectiveGlobe({
  hotspots,
  selectedRank,
  selectionVersion,
  caution,
  onSelect,
}: {
  hotspots: Hotspot[];
  selectedRank: number | null;
  selectionVersion: number;
  caution: boolean;
  onSelect: (rank: number) => void;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const markerElements = useRef(new Map<number, HTMLButtonElement>());
  const reduced = useMotionPreference();
  const fail = useCallback(() => setSupported(false), []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        setSupported(Boolean(gl));
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        setSupported(false);
      }
    });
    const observer = new IntersectionObserver((entries) => setVisible(entries[0].isIntersecting), {
      rootMargin: '80px',
    });
    if (root.current) observer.observe(root.current);
    const change = () => setTabVisible(document.visibilityState === 'visible');
    change();
    document.addEventListener('visibilitychange', change);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', change);
    };
  }, []);
  // Selecting a region stops the surface rotation while its position is inspected.
  const userFocused = selectionVersion > 0;
  const [resumedVersion, setResumedVersion] = useState(-1);
  const selectionPaused = userFocused && resumedVersion !== selectionVersion;
  const animated = !paused && !selectionPaused && !reduced && visible && tabVisible;
  return (
    <div className="detective-globe" ref={root}>
      <div className="globe-corner">
        <span className="status-dot" /> NASA POWER · MERRA-2
        <br />
        <small>Regional centroids · not area boundaries</small>
      </div>
      {supported === null ? (
        <p className="globe-status">Preparing 3D Earth…</p>
      ) : supported ? (
        <Boundary onFailure={fail}>
          <Scene
            hotspots={hotspots}
            selectedRank={selectedRank}
            focus={userFocused && selectionPaused}
            focusVersion={selectionVersion}
            animated={animated}
            markerElements={markerElements}
            onFailure={fail}
          />
        </Boundary>
      ) : (
        <Fallback />
      )}
      {supported && (
        <div className="detective-markers" aria-label="Hotspot centroid markers">
          {hotspots.map((h) => (
            <button
              key={h.rank}
              ref={(element) => {
                if (element) markerElements.current.set(h.rank, element);
                else markerElements.current.delete(h.rank);
              }}
              type="button"
              className={`hotspot-marker ${h.direction} ${selectedRank === h.rank ? 'selected' : ''} ${caution || h.quality_flag === 'suspect_magnitude' ? 'caution' : ''}`}
              aria-pressed={selectedRank === h.rank}
              aria-label={`Select region ${h.rank}: ${h.direction}, centroid ${h.centroid.latitude}, ${h.centroid.longitude}${caution || h.quality_flag === 'suspect_magnitude' ? ', data-quality caution' : ''}`}
              data-latitude={h.centroid.latitude}
              data-longitude={h.centroid.longitude}
              onClick={() => onSelect(h.rank)}
            >
              <span aria-hidden="true">{h.direction === 'increase' ? '↑' : '↓'}</span>
              {h.rank}
            </button>
          ))}
        </div>
      )}
      <div className="detective-globe-footer">
        <span>Drag to rotate · select a numbered marker</span>
        {supported && (
          <button
            className="button secondary"
            type="button"
            disabled={reduced}
            aria-pressed={!animated}
            onClick={() => {
              if (selectionPaused) {
                setResumedVersion(selectionVersion);
                setPaused(false);
              } else setPaused((value) => !value);
            }}
          >
            {animated ? <Pause size={13} /> : <Play size={13} />}{' '}
            {animated ? 'Pause rotation' : 'Resume rotation'}
          </button>
        )}
      </div>
    </div>
  );
}
