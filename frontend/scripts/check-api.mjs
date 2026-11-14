import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';
import { loadFrontendModule } from './load-typescript.mjs';

// This diagnostic uses the application's API client, never a demo fixture.
export async function checkBackend(client, query, log = console.log) {
  async function step(endpoint, operation) {
    try {
      return await operation();
    } catch (error) {
      throw new Error(`${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await step('/api/health', () => client.health());
  log('PASS /api/health — reachable JSON; application/upstream readiness is not yet specified.');

  const variables = await step('/api/variables', () => client.variables());
  const selected = variables.find(variable => variable.id === query.variable);
  if (!selected) throw new Error(`/api/variables: ${query.variable} is not advertised; analysis was not requested.`);
  log(`PASS /api/variables — ${selected.id} is advertised (${selected.unit}).`);

  const analysis = await step('/api/trends', () => client.trends(query));
  if (analysis.unit !== selected.unit) {
    throw new Error('/api/trends: units differ from /api/variables. Agree on consistent units before integration.');
  }
  log('PASS /api/trends — accepted by the frontend validator and matched to the requested selection.');
  log(JSON.stringify({
    location: analysis.location,
    variable: analysis.variable,
    unit: analysis.unit,
    period: [analysis.start_year, analysis.end_year],
    source_reported_by_backend: analysis.source,
    annual_records: analysis.observations.length,
    usable_observations_reported_by_backend: analysis.statistics.observation_count,
    significance_reported_by_backend: analysis.statistics.significant,
  }, null, 2));

  if (!analysis.observations.some(observation => observation.value !== null)) {
    log('WARNING: The response contains no usable observations. Contract checks passed, but real-data display is not demonstrated.');
  }
  if (analysis.statistics.rate_per_decade === null || analysis.statistics.significant === null) {
    log('NOTE: The backend did not return a trend estimate and significance decision together. Review its insufficient-data interpretation.');
  }
  log('This checks the proposed frontend contract only. Verify NASA provenance, methods, and browser CORS separately.');
  return analysis;
}

async function main() {
  // Match next dev's environment-file precedence; shell variables take precedence.
  const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
  nextEnv.loadEnvConfig(frontendRoot, true);
  // Load after environment setup because the client reads its base URL at import time.
  const { api } = loadFrontendModule('lib/api.ts');
  const { DEFAULT_QUERY } = loadFrontendModule('lib/types.ts');
  console.log('Checking the configured backend for Ottawa temperature, 1990–2025. No mock fallback.');
  await checkBackend(api, DEFAULT_QUERY);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`API CHECK FAILED — ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
