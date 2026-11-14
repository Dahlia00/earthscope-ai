import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFrontendModule } from '../scripts/load-typescript.mjs';
const { parseLayers, parseHotspots, createApiClient } = loadFrontendModule('lib/api.ts');
const { geoToCartesian, buildDrilldownHref, parseExplorerQuery } =
  loadFrontendModule('lib/detective.ts');
const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const query = { layer_id: 'temperature_trend', direction: 'both', limit: 10 };
const client = (data) => createApiClient('http://backend.test', async () => Response.json(data));

test('actual layer catalog preserves available, imagery, planned, units, and source metadata', () => {
  const raw = fixture('layers');
  assert.deepEqual(parseLayers(raw), raw);
  assert.equal(raw.filter((l) => l.kind === 'trend_grid' && l.status === 'available').length, 4);
  assert.ok(raw.some((l) => l.status === 'planned'));
});
for (const [label, change] of [
  [
    'duplicate id',
    (d) => {
      d.push(d[0]);
    },
  ],
  [
    'unknown kind',
    (d) => {
      d[0].kind = 'map';
    },
  ],
  [
    'unknown status',
    (d) => {
      d[0].status = 'ready';
    },
  ],
  [
    'missing trend units',
    (d) => {
      d[0].trend_unit = null;
    },
  ],
  [
    'invalid tile source',
    (d) => {
      d[4].tiles.max_zoom = '7';
    },
  ],
  [
    'missing limitations',
    (d) => {
      delete d[0].limitations;
    },
  ],
])
  test(`layer validation rejects ${label}`, () => {
    const d = fixture('layers');
    change(d);
    assert.throws(() => parseLayers(d), /validation/);
  });

test('actual temperature and flagged precipitation responses retain every scientific field', () => {
  for (const name of ['hotspots-temperature', 'hotspots-precipitation']) {
    const d = fixture(name);
    assert.deepEqual(parseHotspots(d), d);
  }
  const p = parseHotspots(fixture('hotspots-precipitation'));
  assert.ok(p.layer_warning);
  assert.equal(p.counts.suspect_regions, 23);
  assert.ok(p.hotspots.some((h) => h.quality_flag === 'suspect_magnitude' && h.warning));
  const t = parseHotspots(fixture('hotspots-temperature'));
  assert.equal(t.hotspots[0].quality_flag, 'not_assessed');
  assert.ok(t.hotspots.some((h) => h.bounds.crosses_antimeridian));
});
for (const [label, change] of [
  [
    'bad centroid latitude',
    (d) => {
      d.hotspots[0].centroid.latitude = 91;
    },
  ],
  [
    'bad drilldown longitude',
    (d) => {
      d.hotspots[0].drilldown.longitude = 181;
    },
  ],
  [
    'missing drilldown',
    (d) => {
      delete d.hotspots[0].drilldown;
    },
  ],
  [
    'wrong direction',
    (d) => {
      d.hotspots[0].direction = 'decrease';
    },
  ],
  [
    'unknown quality flag',
    (d) => {
      d.hotspots[0].quality_flag = 'verified';
    },
  ],
  [
    'suspect region without warning',
    (d) => {
      d.hotspots[0].quality_flag = 'suspect_magnitude';
    },
  ],
  [
    'duplicate rank',
    (d) => {
      d.hotspots[1].rank = 1;
    },
  ],
  [
    'bad area',
    (d) => {
      d.hotspots[0].area_km2 = -1;
    },
  ],
  [
    'invalid peak p-value',
    (d) => {
      d.hotspots[0].peak.p_value = 1.5;
    },
  ],
  [
    'reversed latitude bounds',
    (d) => {
      d.hotspots[0].bounds.south = 90;
    },
  ],
  [
    'bad antimeridian flag',
    (d) => {
      d.hotspots[1].bounds.crosses_antimeridian = false;
    },
  ],
  [
    'invalid FDR level',
    (d) => {
      d.parameters.fdr_q = 5;
    },
  ],
  [
    'invalid counts',
    (d) => {
      d.counts.candidate_cells = d.counts.valid_cells + 1;
    },
  ],
  [
    'missing layer warning field',
    (d) => {
      delete d.layer_warning;
    },
  ],
  [
    'non-string limitation',
    (d) => {
      d.limitations = [1];
    },
  ],
  [
    'non-numeric slope',
    (d) => {
      d.hotspots[0].mean_slope = '1.00';
    },
  ],
])
  test(`hotspot validation rejects ${label}`, () => {
    const d = fixture('hotspots-temperature');
    change(d);
    assert.throws(() => parseHotspots(d), /validation/);
  });

test('empty hotspot lists are valid and remain empty without fabricated substitutes', async () => {
  const d = fixture('hotspots-temperature');
  d.hotspots = [];
  assert.equal((await client(d).hotspots(query)).hotspots.length, 0);
});
test('hotspot request encodes filters, validates selected layer and direction, and keeps no-store/cancellation', async () => {
  const d = fixture('hotspots-temperature');
  const api = createApiClient('http://backend.test', async (url, init) => {
    const u = new URL(url);
    assert.equal(u.pathname, '/api/detective/hotspots');
    assert.equal(u.searchParams.get('layer_id'), query.layer_id);
    assert.equal(u.searchParams.get('direction'), 'both');
    assert.equal(u.searchParams.get('limit'), '10');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.signal.aborted, false);
    return Response.json(d);
  });
  assert.deepEqual(await api.hotspots(query), d);
  await assert.rejects(
    client(d).hotspots({ ...query, layer_id: 'humidity_trend' }),
    /request match/,
  );
  await assert.rejects(client(d).hotspots({ ...query, direction: 'decrease' }), /request match/);
  await assert.rejects(client(d).hotspots({ ...query, limit: 2 }), /request match/);
  await assert.rejects(client(d).hotspots({ ...query, limit: 0 }), /Invalid hotspot query/);
});
test('unbuilt/failed layers expose backend errors rather than saved example data', async () => {
  const api = createApiClient('http://backend.test', async () =>
    Response.json({ detail: 'Trend grid has not been built yet' }, { status: 503 }),
  );
  await assert.rejects(api.hotspots(query), /HTTP 503.*not been built/);
});

test('geographic projection matches SphereGeometry UVs at cardinal longitudes and poles', () => {
  for (const [point, expected] of [
    [{ latitude: 0, longitude: 0 }, [1, 0, 0]],
    [{ latitude: 0, longitude: 90 }, [0, 0, -1]],
    [{ latitude: 0, longitude: -90 }, [0, 0, 1]],
    [{ latitude: 90, longitude: 0 }, [0, 1, 0]],
    [{ latitude: -90, longitude: 180 }, [0, -1, 0]],
  ]) {
    const actual = geoToCartesian(point, 1);
    expected.forEach((value, i) => assert.ok(Math.abs(actual[i] - value) < 1e-12));
  }
  const d = fixture('hotspots-temperature');
  for (const h of d.hotspots) {
    const v = geoToCartesian(h.centroid);
    assert.ok(Math.abs(Math.hypot(...v) - 1.205) < 1e-12);
    const lat = (Math.asin(v[1] / 1.205) * 180) / Math.PI;
    const lon = (Math.atan2(-v[2], v[0]) * 180) / Math.PI;
    assert.ok(Math.abs(lat - h.centroid.latitude) < 1e-9);
    assert.ok(Math.abs(lon - h.centroid.longitude) < 1e-9);
  }
});
test('drilldown uses backend drilldown coordinates, variable, and grid period, never centroid/default Ottawa', () => {
  const d = fixture('hotspots-temperature'),
    h = d.hotspots[0];
  const url = new URL(buildDrilldownHref(d, h), 'http://frontend.test');
  assert.equal(url.pathname, '/explore');
  assert.equal(Number(url.searchParams.get('latitude')), h.drilldown.latitude);
  assert.equal(Number(url.searchParams.get('longitude')), h.drilldown.longitude);
  assert.notEqual(Number(url.searchParams.get('latitude')), h.centroid.latitude);
  assert.equal(url.searchParams.get('variable'), d.variable);
  assert.equal(Number(url.searchParams.get('start_year')), d.period_start_year);
  assert.equal(Number(url.searchParams.get('end_year')), d.period_end_year);
  assert.equal(
    parseExplorerQuery(Object.fromEntries(url.searchParams)).latitude,
    h.drilldown.latitude,
  );
});
test('invalid/deceptive URL selections are rejected before analysis', () => {
  for (const query of [
    {},
    { latitude: '', longitude: '0', variable: 'T2M', start_year: '1981', end_year: '2025' },
    { latitude: '91', longitude: '0', variable: 'T2M', start_year: '1981', end_year: '2025' },
    {
      latitude: '0',
      longitude: '0',
      variable: ['T2M', 'RH2M'],
      start_year: '1981',
      end_year: '2025',
    },
    { latitude: '0', longitude: '0', variable: 'T2M', start_year: '2025', end_year: '1981' },
  ])
    assert.equal(parseExplorerQuery(query), null);
});

test('flagged regional cautions remain attached to the point-investigation link', () => {
  const r = fixture('hotspots-precipitation');
  const url = new URL(buildDrilldownHref(r, r.hotspots[0]), 'http://frontend.test');
  assert.equal(url.searchParams.get('detective_caution'), '1');
});
