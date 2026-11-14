import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFrontendModule } from '../scripts/load-typescript.mjs';
import { checkBackend } from '../scripts/check-api.mjs';

const { createApiClient, parseAnalysis, parseBackendAnalysis, parseVariables } =
  loadFrontendModule('lib/api.ts');
const captured = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const fixture = () => captured('ottawa-trends');
const query = {
  latitude: 45.4215,
  longitude: -75.6972,
  variable: 'T2M',
  start_year: 1990,
  end_year: 2025,
};
const clientFor = (data) => createApiClient('http://backend.test', async () => Response.json(data));

// Positive fixtures are captured actual API responses. Mutations below are transport
// validation scenarios only, never scientific findings or production fallback data.
test('variables accepts the actual bare array, maps name to label, and preserves all metadata', async () => {
  const wire = captured('variables');
  const result = await clientFor(wire).variables();
  assert.equal(result.length, 3);
  for (let i = 0; i < result.length; i++) {
    assert.equal(result[i].label, wire[i].name);
    assert.equal(result[i].unit, wire[i].unit);
    assert.deepEqual(result[i].metadata, wire[i]);
  }
  assert.deepEqual(parseVariables([]), []);
});

for (const [name, mutate] of [
  ['old wrapper format', () => ({ variables: captured('variables') })],
  [
    'missing trend unit',
    (data) => {
      delete data[0].trend_unit;
      return data;
    },
  ],
  [
    'empty unit',
    (data) => {
      data[0].unit = '';
      return data;
    },
  ],
  [
    'duplicate IDs',
    (data) => {
      data.push(data[0]);
      return data;
    },
  ],
  [
    'invalid coverage',
    (data) => {
      data[0].coverage_start_year = '1981';
      return data;
    },
  ],
  [
    'missing aggregation',
    (data) => {
      delete data[0].aggregation;
      return data;
    },
  ],
]) {
  test(`variables rejects ${name}`, () =>
    assert.throws(() => parseVariables(mutate(captured('variables'))), /validation/));
}

test('health validates both status and service', async () => {
  assert.deepEqual(await clientFor(captured('health')).health(), captured('health'));
  for (const body of [{ status: 'ok' }, { status: 'error', service: 'backend' }, null])
    await assert.rejects(clientFor(body).health(), /health/);
});

test('live trends encodes the query and keeps the actual full backend response unchanged', async () => {
  const body = fixture();
  let calls = 0;
  const client = createApiClient('http://backend.test/', async (url, init) => {
    calls++;
    const request = new URL(url);
    assert.equal(request.pathname, '/api/trends');
    for (const [key, value] of Object.entries(query))
      assert.equal(request.searchParams.get(key), String(value));
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Accept, 'application/json');
    assert.equal(init.signal.aborted, false);
    return Response.json(body);
  });
  const result = await client.trends(query);
  assert.equal(calls, 1);
  assert.deepEqual(result.backend, body);
  assert.equal(result.location.latitude, body.location.requested_latitude);
  assert.notEqual(result.location.latitude, body.location.cell_latitude);
  assert.equal(result.variable, body.variable.id);
  assert.equal(result.unit, body.variable.unit);
  assert.equal(result.trend_unit, body.variable.trend_unit);
  assert.equal(result.statistics.rate_per_decade, body.trend.slope_per_decade);
  assert.deepEqual(structuredClone(result.statistics.confidence_interval), [
    body.trend.ci_lower_per_decade,
    body.trend.ci_upper_per_decade,
  ]);
  assert.equal(result.statistics.confidence_level, body.trend.confidence_level);
  assert.equal(result.statistics.p_value, body.trend.p_value);
  assert.equal(result.statistics.significant, body.trend.significant);
  assert.equal(result.statistics.observation_count, body.counts.annual_complete);
  assert.deepEqual(
    structuredClone(result.observations.map((o) => ({ year: o.year, value: o.trend }))),
    body.trend.trend_line,
  );
  assert.equal(result.interpretation, body.interpretation);
});

test('snapshot provenance, quality warnings, limitations, and diagnostics survive adaptation', async () => {
  const body = fixture();
  body.data_origin = 'snapshot';
  body.warnings = ['Synthetic transport warning: test that warnings remain visible.'];
  body.trend.autocorrelation_flag = true;
  const result = await clientFor(body).trends(query);
  assert.deepEqual(result.backend, body);
  assert.equal(result.backend.data_origin, 'snapshot');
  assert.equal(result.backend.retrieved_at, body.retrieved_at);
});

test('non-significance is the backend decision, never inferred from slope or p-value', async () => {
  const body = fixture();
  body.trend.significant = false;
  assert.equal((await clientFor(body).trends(query)).statistics.significant, false);
});

test('excluded interior year creates a null chart gap, not an invented annual mean or line', async () => {
  const body = fixture();
  body.monthly_observations = body.monthly_observations.filter(
    (o) => !(o.year === 2000 && o.month === 2),
  );
  body.annual_values = body.annual_values.filter((o) => o.year !== 2000);
  body.trend.trend_line = body.trend.trend_line.filter((o) => o.year !== 2000);
  body.counts = {
    monthly_valid: 431,
    monthly_missing: 1,
    annual_complete: 35,
    incomplete_years_excluded: [2000],
  };
  const result = await clientFor(body).trends(query);
  assert.deepEqual(structuredClone(result.observations.find((o) => o.year === 2000)), {
    year: 2000,
    value: null,
    trend: null,
  });
  assert.deepEqual(result.backend, body);
});

test('absent whole years are gaps even when upstream missing_count counts only explicit fill values', async () => {
  const body = fixture();
  body.monthly_observations = body.monthly_observations.filter((o) => o.year !== 2000);
  body.annual_values = body.annual_values.filter((o) => o.year !== 2000);
  body.trend.trend_line = body.trend.trend_line.filter((o) => o.year !== 2000);
  body.counts.monthly_valid -= 12;
  body.counts.annual_complete--;
  const result = await clientFor(body).trends(query);
  assert.equal(result.observations.find((o) => o.year === 2000).value, null);
});

test('analyzed period can be narrower than requested period without being a selection mismatch', async () => {
  const body = fixture();
  body.monthly_observations = body.monthly_observations.filter((o) => o.year > 1990);
  body.annual_values = body.annual_values.filter((o) => o.year > 1990);
  body.trend.trend_line = body.trend.trend_line.filter((o) => o.year > 1990);
  body.period.analyzed_start_year = 1991;
  body.counts.monthly_valid = 420;
  body.counts.annual_complete = 35;
  const result = await clientFor(body).trends(query);
  assert.equal(result.start_year, 1991);
  assert.equal(result.backend.period.requested_start_year, 1990);
});

for (const [name, mutate] of [
  [
    'location',
    (body) => {
      body.location.requested_latitude = 0;
    },
  ],
  [
    'variable',
    (body) => {
      body.variable.id = 'OTHER';
    },
  ],
  [
    'requested period',
    (body) => {
      body.period.requested_start_year = 1989;
    },
  ],
]) {
  test(`withholds a valid response for a different ${name}`, async () => {
    const body = fixture();
    mutate(body);
    await assert.rejects(
      clientFor(body).trends(query),
      /different location, variable, or requested period/,
    );
  });
}

for (const [name, mutate] of [
  [
    'coordinates out of range',
    (b) => {
      b.location.cell_latitude = 91;
    },
  ],
  [
    'missing elevation',
    (b) => {
      delete b.location.elevation_m;
    },
  ],
  [
    'missing source',
    (b) => {
      b.source = '';
    },
  ],
  [
    'invented data origin',
    (b) => {
      b.data_origin = 'demo';
    },
  ],
  [
    'invalid retrieval time',
    (b) => {
      b.retrieved_at = 'yesterday';
    },
  ],
  [
    'missing warnings',
    (b) => {
      delete b.warnings;
    },
  ],
  [
    'non-string limitation',
    (b) => {
      b.limitations = [7];
    },
  ],
  [
    'numeric string observation',
    (b) => {
      b.monthly_observations[0].value = '-7.29';
    },
  ],
  [
    'null monthly observation',
    (b) => {
      b.monthly_observations[0].value = null;
    },
  ],
  [
    'invalid month',
    (b) => {
      b.monthly_observations[0].month = 13;
    },
  ],
  [
    'duplicate month',
    (b) => {
      b.monthly_observations[1] = b.monthly_observations[0];
    },
  ],
  [
    'unordered months',
    (b) => {
      b.monthly_observations.reverse();
    },
  ],
  [
    'duplicate annual year',
    (b) => {
      b.annual_values[1].year = 1990;
    },
  ],
  [
    'incomplete annual mean',
    (b) => {
      b.annual_values[0].months_used = 11;
    },
  ],
  [
    'out-of-period year',
    (b) => {
      b.annual_values[0].year = 1989;
    },
  ],
  [
    'analyzed period outside request',
    (b) => {
      b.period.analyzed_start_year = 1980;
    },
  ],
  [
    'invalid annual count',
    (b) => {
      b.counts.annual_complete = 400;
    },
  ],
  [
    'invalid monthly count',
    (b) => {
      b.counts.monthly_valid = 1;
    },
  ],
  [
    'complete year listed as excluded',
    (b) => {
      b.counts.incomplete_years_excluded = [2000];
    },
  ],
  [
    'null trend',
    (b) => {
      b.trend = null;
    },
  ],
  [
    'missing significance decision',
    (b) => {
      delete b.trend.significant;
    },
  ],
  [
    'invalid p-value',
    (b) => {
      b.trend.p_value = 2;
    },
  ],
  [
    'reversed CI',
    (b) => {
      b.trend.ci_lower_per_decade = 100;
    },
  ],
  [
    'invalid confidence level',
    (b) => {
      b.trend.confidence_level = 95;
    },
  ],
  [
    'invalid test level',
    (b) => {
      b.trend.significance_level = 0;
    },
  ],
  [
    'missing method',
    (b) => {
      delete b.trend.method;
    },
  ],
  [
    'invalid autocorrelation',
    (b) => {
      b.trend.lag1_autocorrelation = 2;
    },
  ],
  [
    'non-boolean diagnostic flag',
    (b) => {
      b.trend.autocorrelation_flag = 'false';
    },
  ],
  [
    'incorrect trend years',
    (b) => {
      b.trend.trend_line[0].year = 2000;
    },
  ],
  [
    'missing trend point',
    (b) => {
      b.trend.trend_line.pop();
    },
  ],
]) {
  test(`rejects ${name} without weakening scientific validation`, () => {
    const body = fixture();
    mutate(body);
    assert.throws(() => parseBackendAnalysis(body), /validation/);
  });
}

test('null, old frontend wire format, and incomplete payloads are rejected', () => {
  for (const body of [null, {}, { observations: [], statistics: {} }, { annual_values: [] }])
    assert.throws(() => parseAnalysis(body), /validation/);
});

test('FastAPI insufficient-data 422 and structured validation detail are visible, not demo substitutes', async () => {
  for (const detail of [
    'Only 3 complete years of data; at least 10 are needed to estimate a trend.',
    [
      {
        loc: ['query', 'latitude'],
        msg: 'Input should be less than or equal to 90',
        type: 'less_than_equal',
      },
    ],
  ]) {
    const client = createApiClient('http://backend.test', async () =>
      Response.json({ detail }, { status: 422 }),
    );
    await assert.rejects(client.trends(query), /HTTP 422.*(Only 3 complete years|Input should)/);
  }
});
for (const status of [404, 502, 503]) {
  test(`HTTP ${status} retains backend error and never falls back`, async () => {
    let calls = 0;
    const client = createApiClient('http://backend.test', async () => {
      calls++;
      return Response.json({ detail: 'Upstream unavailable' }, { status });
    });
    await assert.rejects(client.trends(query), new RegExp(`HTTP ${status}.*Upstream unavailable`));
    assert.equal(calls, 1);
  });
}

test('malformed JSON, network/CORS failure, and timeouts have distinct messages', async () => {
  const bad = createApiClient(
    'http://backend.test',
    async () => new Response('<html>Error</html>'),
  );
  await assert.rejects(bad.trends(query), /invalid JSON/);
  const offline = createApiClient('http://backend.test', async () => {
    throw new TypeError('Offline');
  });
  await assert.rejects(offline.trends(query), /Unable to reach.*CORS/);
  const timeout = createApiClient('http://backend.test', async () => {
    const e = new Error('timeout');
    e.name = 'TimeoutError';
    throw e;
  });
  await assert.rejects(timeout.trends(query), /45 seconds/);
});

test('caller cancellation propagates to Fetch without being turned into a connection error', async () => {
  const controller = new AbortController();
  const reason = new Error('Selection changed');
  const client = createApiClient('http://backend.test', async (_url, init) => {
    controller.abort(reason);
    init.signal.throwIfAborted();
  });
  await assert.rejects(client.trends(query, controller.signal), (e) => e === reason);
});

function fixtureBackend() {
  const calls = [];
  const client = createApiClient('http://backend.test', async (url) => {
    const path = new URL(url).pathname;
    calls.push(path);
    return Response.json(
      path === '/api/health'
        ? captured('health')
        : path === '/api/variables'
          ? captured('variables')
          : fixture(),
    );
  });
  return { client, calls };
}
test('check:api tests actual wire shapes in order and reports provenance and limitations', async () => {
  const { client, calls } = fixtureBackend();
  const messages = [];
  await checkBackend(client, query, (message) => messages.push(message));
  assert.deepEqual(calls, ['/api/health', '/api/variables', '/api/trends']);
  assert.ok(messages.some((m) => m.includes('"data_origin": "live"')));
  assert.ok(messages.some((m) => m.includes('"limitations"')));
});
test('diagnostic stops before trends when variable discovery is empty', async () => {
  let requested = false;
  await assert.rejects(
    checkBackend(
      {
        health: async () => captured('health'),
        variables: async () => [],
        trends: async () => {
          requested = true;
        },
      },
      query,
      () => {},
    ),
    /not advertised/,
  );
  assert.equal(requested, false);
});
test('diagnostic catches observation and trend unit mismatches', async () => {
  for (const field of ['unit', 'trend_unit']) {
    const variables = parseVariables(captured('variables'));
    const analysis = parseAnalysis(fixture());
    variables[0].metadata[field] = 'wrong';
    if (field === 'unit') variables[0].unit = 'wrong';
    await assert.rejects(
      checkBackend(
        {
          health: async () => captured('health'),
          variables: async () => variables,
          trends: async () => analysis,
        },
        query,
        () => {},
      ),
      /units differ/,
    );
  }
});
