'use client';

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { CloudRain, Leaf, Pause, Play, RotateCcw, Thermometer } from 'lucide-react';
import { motion } from 'motion/react';
import { useMotionPreference } from './useMotionPreference';

function StaticEarth({ message = 'Earth preview' }: { message?: string }) {
  return (
    <div className="earth-static" role="img" aria-label="Static Earth illustration">
      <div className="earth-static-sphere">
        <Image
          src="/textures/earth-still.webp"
          alt=""
          fill
          sizes="(max-width: 700px) 80vw, 450px"
          preload
        />
      </div>
      <span className="earth-fallback-label">{message}</span>
    </div>
  );
}

const EarthScene = dynamic(() => import('./EarthScene'), {
  ssr: false,
  loading: () => <StaticEarth />,
});

class GlobeBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? (
      <StaticEarth message="Static preview · 3D view unavailable" />
    ) : (
      this.props.children
    );
  }
}

const signals = [
  {
    name: 'Temperature',
    value: '+0.4 °C',
    unit: '/ decade',
    icon: Thermometer,
    color: 'cyan',
    path: 'M0 31 L9 23 L18 26 L27 33 L36 31 L45 25 L54 28 L63 22 L72 24 L81 17 L90 20 L99 13 L108 14 L117 8 L126 3',
  },
  {
    name: 'Precipitation',
    value: '−2.0 %',
    unit: '/ decade',
    icon: CloudRain,
    color: 'purple',
    path: 'M0 10 L9 5 L18 13 L27 12 L36 19 L45 17 L54 25 L63 21 L72 27 L81 25 L90 31 L99 28 L108 33 L117 29 L126 34',
  },
  {
    name: 'Humidity',
    value: '+1.2 %',
    unit: '/ decade',
    icon: Leaf,
    color: 'green',
    path: 'M0 32 L9 30 L18 32 L27 28 L36 31 L45 25 L54 26 L63 21 L72 23 L81 18 L90 20 L99 12 L108 15 L117 10 L126 6',
  },
] as const;

function SignalCard({
  signal,
  index,
  paused,
}: {
  signal: (typeof signals)[number];
  index: number;
  paused: boolean;
}) {
  const Icon = signal.icon;
  const reduced = useMotionPreference();
  return (
    <motion.div
      className={`signal-card signal-${signal.color}`}
      initial={{ opacity: 1, y: reduced ? 0 : 12 }}
      animate={{ y: 0 }}
      transition={{ duration: reduced ? 0 : 0.8, delay: index * 0.15 }}
    >
      <div className="signal-top">
        <Icon size={25} strokeWidth={1.7} />
        <div>
          <h3>{signal.name}</h3>
          <p>
            <strong>{signal.value}</strong> <span>{signal.unit}</span>
          </p>
        </div>
      </div>
      <svg viewBox="0 0 126 40" fill="none" aria-hidden="true">
        <path
          className="spark-grid"
          d="M0 12H126M0 26H126M0 40H126M0 0V40M42 0V40M84 0V40M126 0V40"
        />
        <path className="spark-fill" d={`${signal.path} L126 40 L0 40Z`} />
        <motion.path
          className="spark-line"
          d={signal.path}
          initial={{ pathLength: reduced || paused ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduced || paused ? 0 : 1.6, delay: 0.4 + index * 0.2 }}
        />
      </svg>
      <span className="signal-label">Illustrative only</span>
    </motion.div>
  );
}

export function EarthVisual() {
  const container = useRef<HTMLDivElement>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);
  const [visible, setVisible] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const reduced = useMotionPreference();
  const fail = useCallback(() => setSupported(false), []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        const available = Boolean(gl);
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
        setSupported(available);
      } catch {
        setSupported(false);
      }
    });
    const observer = new IntersectionObserver((entries) => setVisible(entries[0].isIntersecting), {
      rootMargin: '80px',
    });
    if (container.current) observer.observe(container.current);
    const visibility = () => setTabVisible(document.visibilityState === 'visible');
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  const animated = !paused && !reduced && visible && tabVisible;
  const staticView = supported === false || still;
  return (
    <div ref={container} className={`earth-visual ${!animated ? 'globe-paused' : ''}`}>
      <div className="earth-aura" aria-hidden="true" />
      <div className="earth-sun" aria-hidden="true" />
      <div className="earth-canvas">
        {supported === null ? (
          <StaticEarth />
        ) : staticView ? (
          <StaticEarth
            message={still ? 'Still view · animation off' : 'Static preview · 3D unavailable'}
          />
        ) : (
          <GlobeBoundary onFailure={fail}>
            <EarthScene animated={animated} onFailure={fail} />
          </GlobeBoundary>
        )}
      </div>
      <div
        className="signal-cards"
        aria-label="Fictional illustrative environmental signals, not NASA findings"
      >
        {signals.map((signal, index) => (
          <SignalCard key={signal.name} signal={signal} index={index} paused={!animated} />
        ))}
      </div>
      <div className="earth-toolbar">
        <span>{staticView || supported === null ? 'A NEW PERSPECTIVE' : 'DRAG TO EXPLORE'}</span>
        {supported && !still && (
          <button
            data-globe-pause
            type="button"
            aria-label={reduced ? 'Globe animation paused for reduced motion' : paused ? 'Resume globe animation' : 'Pause globe animation'}
            aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}
            disabled={Boolean(reduced)}
            title={reduced ? 'Animation disabled by reduced-motion preference' : undefined}
          >
            {paused || reduced ? <Play size={13} /> : <Pause size={13} />}
          </button>
        )}
        {supported && (
          <button
            className="earth-view-button"
            type="button"
            onClick={() => setStill((value) => !value)}
          >
            {still ? (
              <>
                <RotateCcw size={12} /> 3D view
              </>
            ) : (
              'Still view'
            )}
          </button>
        )}
      </div>
      <span className="hero-signal-note">Illustrative signals · not historical observations</span>
    </div>
  );
}
