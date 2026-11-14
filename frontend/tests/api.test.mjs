import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontendModule } from '../scripts/load-typescript.mjs';
import { checkBackend } from '../scripts/check-api.mjs';

const { createApiClient, parseAnalysis } = loadFrontendModule('lib/api.ts');
const query = { latitude: 45.4215, longitude: -75.6972, variable: 'T2M', start_year: 1990, end_year: 2025 };

// Fictional transport-test fixture. These numbers are not NASA data or trend estimates.
function fixture() {
  return {
    location: { latitude: query.latitude, longitude: query.longitude },
    variable: 'T2M', unit: '°C', source: 'Fictional API test fixture',
    start_year: 1990, end_year: 2025,
    observations: [{ year: 1990, value: 6.1 }, { year: 1991, value: null }],
    statistics: {
      direction: null, rate_per_decade: null, p_value: null,
      confidence_interval_95: null, significant: null, observation_count: 1,
    },
    interpretation: 'Fictional insufficient-data response.',
  };
}
const clientFor = data => createApiClient('http://backend.test', async () => Response.json(data));

test('live request encodes the selection, requests JSON without caching, and returns only response data', async () => {
  const body = fixture();
  let calls = 0;
  const client = createApiClient('http://backend.test/', async (url, init) => {
    calls++;
    const request = new URL(url);
    assert.equal(request.origin, 'http://backend.test');
    assert.equal(request.pathname, '/api/trends');
    for (const [key, value] of Object.entries(query)) assert.equal(request.searchParams.get(key), String(value));
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Accept, 'application/json');
    assert.equal(init.signal.aborted, false);
    return Response.json(body);
  });
  assert.deepEqual(await client.trends(query), body);
  assert.equal(calls, 1);
});

test('empty results and unavailable statistical values survive unchanged', async () => {
  const body = fixture();
  body.observations = [];
  body.statistics.observation_count = 0;
  body.interpretation = null;
  assert.deepEqual(await clientFor(body).trends(query), body);
});

test('explicit non-significance is preserved, not inferred from p-value', async () => {
  const body = fixture();
  body.statistics.significant = false;
  body.statistics.p_value = 0.001; // Deliberately different from a common threshold decision.
  assert.equal((await clientFor(body).trends(query)).statistics.significant, false);
});

test('backend-supplied estimates are preserved without frontend computation', async () => {
  const body = fixture();
  body.observations[0].trend = 5.8;
  Object.assign(body.statistics, { direction: 'increasing', rate_per_decade: 0.2, confidence_interval_95: [0.1, 0.3], significant: true });
  assert.deepEqual(await clientFor(body).trends(query), body);
});

for (const [label, edit] of [
  ['location', body => { body.location.latitude = 0; }],
  ['variable', body => { body.variable = 'OTHER'; }],
  ['period', body => { body.end_year = 2024; }],
]) {
  test(`a valid-shaped response for a different ${label} is withheld`, async () => {
    const body = fixture(); edit(body);
    await assert.rejects(clientFor(body).trends(query), /different location, variable, or period/);
  });
}

for (const [label, edit] of [
  ['out-of-range coordinates', body => { body.location.latitude = 91; }],
  ['absent source', body => { body.source = ''; }],
  ['non-numeric observation', body => { body.observations[0].value = '6.1'; }],
  ['out-of-period observation', body => { body.observations[0].year = 1989; }],
  ['duplicate year', body => { body.observations[1].year = 1990; }],
  ['unordered observations', body => { body.observations.reverse(); }],
  ['missing significance', body => { delete body.statistics.significant; }],
  ['invalid p-value', body => { body.statistics.p_value = 1.1; }],
  ['reversed confidence interval', body => { body.statistics.confidence_interval_95 = [2, 1]; }],
  ['impossible observation count', body => { body.statistics.observation_count = 3; }],
]) {
  test(`rejects ${label} instead of exposing misleading results`, async () => {
    const body = fixture(); edit(body);
    await assert.rejects(clientFor(body).trends(query), /proposed API contract/);
  });
}

test('null and incomplete payloads are rejected', () => {
  for (const data of [null, {}, { observations: [] }]) assert.throws(() => parseAnalysis(data), /proposed API contract/);
});

test('health and supported variable endpoints are requested and validated separately', async () => {
  const urls = [];
  const variables = { variables: [{ id: 'T2M', label: 'Temperature', unit: '°C' }] };
  const client = createApiClient('http://backend.test', async url => {
    urls.push(url);
    return Response.json(url.endsWith('/api/health') ? { status: 'ok' } : variables);
  });
  assert.deepEqual(await client.health(), { status: 'ok' });
  assert.deepEqual(await client.variables(), variables.variables);
  assert.deepEqual(urls, ['http://backend.test/api/health', 'http://backend.test/api/variables']);
  assert.deepEqual(await clientFor({ variables: [] }).variables(), []);
});

test('variable discovery rejects unknown shapes, empty units, and duplicate identifiers', async () => {
  for (const body of [[], { variables: [{ id: 'T2M', label: 'Temperature', unit: '' }] },
    { variables: [{ id: 'T2M', label: 'A', unit: '°C' }, { id: 'T2M', label: 'B', unit: '°C' }] }]) {
    await assert.rejects(clientFor(body).variables(), /proposed API contract/);
  }
});

for (const status of [404, 422, 503]) {
  test(`HTTP ${status} fails explicitly with no demo fallback`, async () => {
    let calls = 0;
    const client = createApiClient('http://backend.test', async () => {
      calls++; return new Response('backend failure', { status });
    });
    await assert.rejects(client.trends(query), new RegExp(`HTTP ${status}`));
    assert.equal(calls, 1);
  });
}

test('HTML or malformed JSON produces a contract error', async () => {
  const client = createApiClient('http://backend.test', async () => new Response('<html>Error</html>'));
  await assert.rejects(client.trends(query), /invalid JSON/);
});

test('network/CORS failure explains the configured API address', async () => {
  const client = createApiClient('http://backend.test', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(client.trends(query), /Unable to reach http:\/\/backend.test.*CORS/);
});

test('a timeout becomes a useful retry message', async () => {
  const client = createApiClient('http://backend.test', async () => {
    const error = new Error('timeout'); error.name = 'TimeoutError'; throw error;
  });
  await assert.rejects(client.trends(query), /within 20 seconds/);
});

test('caller cancellation reaches Fetch and remains a cancellation', async () => {
  const controller = new AbortController();
  const reason = new Error('Selection changed');
  const client = createApiClient('http://backend.test', async (_url, init) => {
    controller.abort(reason);
    init.signal.throwIfAborted();
  });
  await assert.rejects(client.trends(query, controller.signal), error => error === reason);
});


test('backend diagnostic uses health, variables, and real client validation in order', async () => {
  const calls = [];
  const messages = [];
  const client = createApiClient('http://backend.test', async url => {
    const path = new URL(url).pathname;
    calls.push(path);
    if (path === '/api/health') return Response.json({ status: 'ok' });
    if (path === '/api/variables') return Response.json({ variables: [{ id: 'T2M', label: 'Temperature', unit: '°C' }] });
    return Response.json(fixture());
  });
  assert.deepEqual(await checkBackend(client, query, message => messages.push(message)), fixture());
  assert.deepEqual(calls, ['/api/health', '/api/variables', '/api/trends']);
  assert.ok(messages.some(message => message.includes('source_reported_by_backend')));
  assert.ok(messages.some(message => message.includes('Verify NASA provenance')));
});

test('diagnostic stops before trends when temperature is unsupported', async () => {
  let requestedTrend = false;
  const client = {
    health: async () => ({}),
    variables: async () => [],
    trends: async () => { requestedTrend = true; return fixture(); },
  };
  await assert.rejects(checkBackend(client, query, () => {}), /T2M is not advertised/);
  assert.equal(requestedTrend, false);
});

test('diagnostic names the failing endpoint and never claims success after connection failure', async () => {
  const messages = [];
  const client = createApiClient('http://backend.test', async () => { throw new TypeError('Offline'); });
  await assert.rejects(checkBackend(client, query, message => messages.push(message)), /\/api\/health: Unable to reach/);
  assert.deepEqual(messages, []);
});

test('diagnostic rejects inconsistent units across variable discovery and analysis', async () => {
  const client = {
    health: async () => ({}),
    variables: async () => [{ id: 'T2M', unit: 'K' }],
    trends: async () => fixture(),
  };
  await assert.rejects(checkBackend(client, query, () => {}), /units differ/);
});

test('diagnostic distinguishes empty valid responses from evidence of a real-data display', async () => {
  const body = fixture();
  body.observations = [];
  body.statistics.observation_count = 0;
  const messages = [];
  const client = {
    health: async () => ({}),
    variables: async () => [{ id: 'T2M', unit: '°C' }],
    trends: async () => parseAnalysis(body),
  };
  await checkBackend(client, query, message => messages.push(message));
  assert.ok(messages.some(message => message.includes('no usable observations')));
  assert.ok(messages.some(message => message.includes('insufficient-data')));
});
