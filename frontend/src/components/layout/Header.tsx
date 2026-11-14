'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Earth, Rocket } from 'lucide-react';

export function Header() {
  const path = usePathname();
  const landing = path === '/';
  return (
    <header className={`site-header ${landing ? 'landing-header' : ''}`}>
      <Link href="/" className="brand" aria-label="EarthScope AI home">
        <span className="brand-icon">
          <Earth size={31} strokeWidth={1.8} />
        </span>
        EarthScope <span className="brand-ai">AI</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link
          className={landing ? 'active' : ''}
          aria-current={landing ? 'page' : undefined}
          href="/"
        >
          Home
        </Link>
        <Link
          className={path === '/explore' ? 'active' : ''}
          aria-current={path === '/explore' ? 'page' : undefined}
          href="/explore"
        >
          Explore
        </Link>
        <Link
          href="/detective"
          className={path === '/detective' ? 'active' : ''}
          aria-current={path === '/detective' ? 'page' : undefined}
        >
          Discover a Mystery
        </Link>
        <Link href="/#about">About</Link>
      </nav>
      <Link className="header-cta" href="/explore">
        <Rocket size={15} /> Start Exploring <ArrowRight size={16} />
      </Link>
    </header>
  );
}
