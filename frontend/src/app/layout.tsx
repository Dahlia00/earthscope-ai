import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import './globals.css';
export const metadata: Metadata = {
  title: 'EarthScope AI · Explore the Planet. Discover the Change.',
  description:
    'Explore environmental observations, investigate historical trends, and understand the science of a changing planet.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Header />
        {children}
        <footer className="site-footer">
          <span className="footer-brand">
            EarthScope AI <span>Explore the Planet. Discover the Change.</span>
          </span>
          <span>An independent NASA Space Apps project · 2026</span>
        </footer>
      </body>
    </html>
  );
}
