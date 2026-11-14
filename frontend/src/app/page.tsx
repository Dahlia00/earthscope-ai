import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  ChevronDown,
  Database,
  Earth,
  FlaskConical,
  Globe2,
  MapPin,
  Microscope,
  Play,
  Satellite,
  Search,
  Sparkles,
} from 'lucide-react';
import { EarthVisual } from '@/components/landing/EarthVisual';
import { Reveal } from '@/components/landing/Reveal';
import './landing.css';

const features = [
  {
    icon: Satellite,
    title: 'Explore NASA Earth Data',
    description: 'Investigate environmental observations for the places that matter to you.',
    className: 'feature-earth',
    href: '/explore',
  },
  {
    icon: ChartNoAxesCombined,
    title: 'Analyze Environmental Trends',
    description:
      'Follow the evidence through time with interactive charts and clear trend results.',
    className: 'feature-mountain',
    href: '/explore',
  },
  {
    icon: Search,
    title: 'Discover Significant Changes',
    description: 'Understand what the statistics tell us — and where uncertainty remains.',
    className: 'feature-forest',
    href: '#how-it-works',
  },
];

export default function Home() {
  return (
    <main id="main" className="landing-page">
      <section className="cinematic-hero" aria-labelledby="hero-title">
        <div className="space-nebula" aria-hidden="true" />
        <div className="planetary-horizon" aria-hidden="true" />
        <div className="cinematic-hero-inner">
          <div className="cinematic-copy">
            <Reveal>
              <div className="data-badge">
                <span className="data-badge-mark">
                  <Satellite size={23} />
                </span>
                <span>Built for NASA Earth observation data</span>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 id="hero-title">
                EarthScope <span>AI</span>
              </h1>
              <h2>Explore the Planet. Discover the Change.</h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="hero-description">
                Investigate NASA Earth observation data, analyze environmental trends, and uncover
                the hidden stories of our changing planet.
              </p>
            </Reveal>
            <Reveal delay={0.24} className="cinematic-actions">
              <Link className="space-button space-primary" href="/explore">
                <PlayIcon /> Start Exploring <ArrowRight size={18} />
              </Link>
              <a className="space-button space-secondary" href="/detective">
                <Search size={19} /> Discover a Mystery
              </a>
            </Reveal>
            <Reveal delay={0.3}>
              <div className="hero-capabilities">
                <div>
                  <Database />
                  <span>
                    <strong>Historical</strong>
                    <small>Environmental data</small>
                  </span>
                </div>
                <div>
                  <Globe2 />
                  <span>
                    <strong>Your location</strong>
                    <small>A global perspective</small>
                  </span>
                </div>
                <div>
                  <ChartNoAxesCombined />
                  <span>
                    <strong>Evidence first</strong>
                    <small>Backend trend analysis</small>
                  </span>
                </div>
              </div>
              <p className="hero-demo-note">
                <FlaskConical size={12} /> Explorer opens in clearly labeled demo mode.
              </p>
            </Reveal>
          </div>
          <EarthVisual />
        </div>
        <a className="hero-scroll" href="#how-it-works" aria-label="Scroll to how it works">
          <ChevronDown size={29} />
          <ChevronDown size={29} />
        </a>
      </section>

      <section className="landing-features landing-container" aria-label="Explore the platform">
        {features.map(({ icon: Icon, ...feature }, index) => (
          <Reveal key={feature.title} delay={index * 0.1}>
            <Link href={feature.href} className={`space-feature ${feature.className}`}>
              <span className="space-feature-icon">
                <Icon size={30} strokeWidth={1.8} />
              </span>
              <div>
                <h2>{feature.title}</h2>
                <p>{feature.description}</p>
              </div>
              <ArrowUpRight className="feature-arrow" size={15} />
            </Link>
          </Reveal>
        ))}
      </section>

      <section
        className="how-it-works landing-container"
        id="how-it-works"
        aria-labelledby="how-title"
      >
        <Reveal>
          <div className="landing-section-title">
            <span>HOW IT WORKS</span>
            <h2 id="how-title">
              From NASA Data to Earth <em>Insights</em>
            </h2>
            <p>A question, a place, a little curiosity. Follow the evidence.</p>
          </div>
        </Reveal>
        <div className="investigation-steps">
          {[
            {
              icon: MapPin,
              title: 'Choose your place',
              text: 'Select a point on the interactive map, then choose temperature and an observation period.',
            },
            {
              icon: ChartNoAxesCombined,
              title: 'Follow the trend',
              text: 'Explore annual observations. In live mode, the backend supplies trend estimates and statistical results.',
            },
            {
              icon: Microscope,
              title: 'Understand the evidence',
              text: 'Read the confidence interval, significance decision, and limitations before drawing a conclusion.',
            },
          ].map(({ icon: Icon, title, text }, index) => (
            <Reveal key={title} delay={index * 0.1}>
              <article className="investigation-step">
                <div className="step-orbit">
                  <Icon size={27} />
                  <span>0{index + 1}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section
        className="mystery-preview landing-container"
        id="mystery"
        aria-labelledby="mystery-title"
      >
        <Reveal>
          <div className="mystery-preview-panel">
            <div className="mystery-symbol">
              <Search size={40} />
            </div>
            <div className="mystery-preview-copy">
              <span className="coming-badge">
                <Sparkles size={12} /> EARTH DETECTIVE · REAL BACKEND LEADS
              </span>
              <h2 id="mystery-title">One planet. Different stories.</h2>
              <p>
                Explore statistically detected regions, inspect their data-quality flags, and follow
                a lead into a detailed point investigation.
              </p>
              <p className="mystery-availability">
                Detected trends are leads, not proof of causes. Precipitation results carry
                unresolved data-quality warnings.
              </p>
            </div>
            <Link className="space-button space-secondary" href="/detective">
              Explore detected regions <ArrowRight size={17} />
            </Link>
          </div>
        </Reveal>
      </section>

      <section className="landing-about landing-container" id="about" aria-labelledby="about-title">
        <Reveal>
          <div className="landing-about-grid">
            <div>
              <span className="landing-kicker">
                <Earth size={16} /> BUILT FOR CURIOSITY. GROUNDED IN SCIENCE.
              </span>
              <h2 id="about-title">
                Look closer.
                <br />
                Understand more.
              </h2>
              <p>
                EarthScope AI is an independent NASA Space Apps project designed to make
                environmental science easier to explore. We separate observations, statistical
                evidence, and interpretation — so you can see what a result actually supports.
              </p>
              <Link className="landing-text-link" href="/explore">
                Begin your investigation <ArrowUpRight size={16} />
              </Link>
            </div>
            <aside className="science-promise">
              <h3>
                <FlaskConical size={19} /> Evidence before conclusions
              </h3>
              <ul>
                <li>Demo observations are fictional and explicitly labeled.</li>
                <li>Live results come from the separately developed analysis API.</li>
                <li>
                  Statistical significance does not establish causation or practical importance.
                </li>
              </ul>
              <p>
                The hero’s signals are illustrative artwork. Earth imagery is a historical
                visualization, not live satellite data.
              </p>
              <p className="texture-credit">
                Earth textures:{' '}
                <a
                  href="https://www.solarsystemscope.com/textures/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Solar System Scope
                </a>{' '}
                ·{' '}
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noreferrer"
                >
                  CC BY 4.0
                </a>
                . No NASA endorsement.
              </p>
            </aside>
          </div>
        </Reveal>
      </section>
    </main>
  );
}

function PlayIcon() {
  return <Play size={18} fill="currentColor" strokeWidth={1.5} />;
}
