import { Suspense } from 'react';
import { connection } from 'next/server';
import Link from 'next/link';
import { Explorer } from '@/components/explorer/Explorer';
import { parseExplorerQuery } from '@/lib/detective';

async function ExploreContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const supplied =
    params.from === 'detective' ||
    ['latitude', 'longitude', 'variable', 'start_year', 'end_year'].some(
      (key) => params[key] !== undefined,
    );
  const query = parseExplorerQuery(params);
  if (supplied && !query)
    return (
      <main id="main" className="section-wrap explorer">
        <div className="error-message" role="alert">
          The analysis link contains invalid or incomplete coordinates, variable, or years. No
          analysis was requested.
        </div>
        <Link className="button secondary" href="/explore">
          Open coordinate explorer
        </Link>
      </main>
    );
  return (
    <Explorer
      key={query ? JSON.stringify(query) : 'coordinate-explorer'}
      initialQuery={query ?? undefined}
      detectiveCaution={params.from === 'detective' && params.detective_caution === '1'}
    />
  );
}
export default function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense
      fallback={
        <main id="main" className="section-wrap explorer">
          Opening point investigation…
        </main>
      }
    >
      <ExploreContent searchParams={searchParams} />
    </Suspense>
  );
}
