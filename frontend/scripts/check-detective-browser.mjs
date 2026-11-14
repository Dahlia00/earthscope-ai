// Optional local visual QA, using an isolated Chrome instance on port 9222.
// Requires Node 22+ for the built-in WebSocket client. Not used by the application.
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const pages = await (await fetch('http://127.0.0.1:9222/json')).json();
const target = pages.find((page) => page.type === 'page');
if (!target) throw new Error('Start isolated Chrome with --remote-debugging-port=9222 first.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
let id = 0;
const pending = new Map();
const errors = [];
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown')
    errors.push(
      message.params.exceptionDetails.text +
        ': ' +
        message.params.exceptionDetails.exception?.description,
    );
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
    errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
  const job = pending.get(message.id);
  if (job) {
    pending.delete(message.id);
    if (message.error) job.reject(new Error(JSON.stringify(message.error)));
    else job.resolve(message.result);
  }
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const key = ++id;
    pending.set(key, { resolve, reject });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function waitFor(expression, timeout = 20000) {
  const passed = await evaluate(
    `new Promise(resolve => { const start = Date.now(); const timer = setInterval(() => { if (${expression}) { clearInterval(timer); resolve(true); } else if (Date.now() - start > ${timeout}) { clearInterval(timer); resolve(false); } }, 100); })`,
  );
  assert.equal(passed, true, `Timed out: ${expression}`);
}
async function screenshot(name, full = false) {
  const layout = await send('Page.getLayoutMetrics');
  const clip = full
    ? {
        x: 0,
        y: 0,
        width: layout.cssContentSize.width,
        height: layout.cssContentSize.height,
        scale: 1,
      }
    : undefined;
  const result = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: full,
    ...(clip ? { clip } : {}),
  });
  await writeFile(
    new URL(`../artifacts/${name}.png`, import.meta.url),
    Buffer.from(result.data, 'base64'),
  );
}
async function navigate(url) {
  const loaded = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener('message', listener);
      reject(new Error('Navigation timeout'));
    }, 30000);
    function listener(event) {
      if (JSON.parse(event.data).method === 'Page.loadEventFired') {
        clearTimeout(timer);
        socket.removeEventListener('message', listener);
        resolve();
      }
    }
    socket.addEventListener('message', listener);
  });
  await send('Page.navigate', { url });
  await loaded;
}
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate('about:blank');
  await waitFor(`location.href==='about:blank'`);
  errors.length = 0;
  await navigate('http://localhost:3000/detective');
  await waitFor(
    `document.querySelectorAll('.region-item').length===10 && document.querySelectorAll('.hotspot-marker').length===10 && document.querySelector('.detective-globe canvas')`,
    30000,
  );
  const expected = await evaluate(
    `fetch('http://localhost:8000/api/detective/hotspots?layer_id=temperature_trend&direction=both&limit=10').then(r=>r.json())`,
  );
  const markers = await evaluate(
    `Array.from(document.querySelectorAll('.hotspot-marker')).map(b=>({rank:Number(b.textContent.replace(/[^0-9]/g,'')),latitude:Number(b.dataset.latitude),longitude:Number(b.dataset.longitude)}))`,
  );
  for (const marker of markers) {
    const h = expected.hotspots.find((h) => h.rank === marker.rank);
    assert.equal(marker.latitude, h.centroid.latitude);
    assert.equal(marker.longitude, h.centroid.longitude);
  }
  await evaluate(`document.querySelectorAll('.region-item')[1].click()`);
  await waitFor(`document.querySelector('.discovery-card-top').textContent.includes('REGION 2')`);
  await evaluate('new Promise(resolve=>setTimeout(resolve,800))');
  const visible = await evaluate(
    `(()=>{for(const b of document.querySelectorAll('.hotspot-marker')){const r=b.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;if(x>0&&y>0&&x<innerWidth&&y<innerHeight&&document.elementFromPoint(x,y)?.closest('.hotspot-marker')===b)return {x,y,rank:Number(b.textContent.replace(/[^0-9]/g,''))};}return null;})()`,
  );
  assert.ok(visible, 'At least one genuine front-facing marker should be clickable');
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: visible.x,
    y: visible.y,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: visible.x,
    y: visible.y,
    button: 'left',
    clickCount: 1,
  });
  await waitFor(
    `document.querySelector('.discovery-card-top').textContent.includes('REGION ${visible.rank}')`,
  );
  await screenshot('detective-desktop', true);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await evaluate('new Promise(resolve=>setTimeout(resolve,400))');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  await screenshot('detective-mobile', true);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  // Use a known returned region, and verify the URL uses drilldown rather than its centroid.
  await evaluate(`document.querySelector('.region-item').click()`);
  const href = await evaluate(`document.querySelector('.drilldown-link').getAttribute('href')`);
  const url = new URL(href, 'http://localhost:3000');
  assert.equal(Number(url.searchParams.get('latitude')), expected.hotspots[0].drilldown.latitude);
  assert.equal(Number(url.searchParams.get('longitude')), expected.hotspots[0].drilldown.longitude);
  assert.equal(url.searchParams.get('start_year'), String(expected.period_start_year));
  await evaluate(`document.querySelector('.drilldown-link').click()`);
  await waitFor(
    `location.pathname==='/explore' && document.querySelector('.evidence-panel')`,
    55000,
  );
  assert.ok(await evaluate(`document.body.innerText.includes('Opened from Earth Detective')`));
  assert.equal(
    await evaluate(
      `document.querySelector('.mode-switch button[aria-pressed="true"]').textContent.includes('Live API')`,
    ),
    true,
  );
  await screenshot('detective-drilldown', true);
  // Actual flagged precipitation results must present the layer-wide caution.
  await navigate('http://localhost:3000/detective');
  await waitFor(`document.querySelectorAll('.region-item').length===10`);
  await evaluate(
    `(()=>{const s=document.querySelector('.detective-controls select');s.value='precipitation_trend';s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await waitFor(
    `document.querySelector('.layer-warning') && document.querySelector('.discovery-card')`,
  );
  assert.ok(
    await evaluate(`document.querySelector('.layer-warning').textContent.includes('23 of 24')`),
  );
  assert.ok(
    await evaluate(
      `document.querySelector('.discovery-card').textContent.includes('not a reliable climate finding')`,
    ),
  );
  assert.equal(await evaluate(`document.querySelectorAll('.region-item .caution').length`), 10);
  assert.equal(await evaluate(`new URL(document.querySelector('.drilldown-link').href).searchParams.get('detective_caution')`), '1');
  await waitFor(`document.querySelector('.detective-globe canvas') && !document.querySelector('.globe-status')`);
  await evaluate('new Promise(resolve=>setTimeout(resolve,500))');
  await screenshot('detective-precipitation-caution', true);
  // Available regional grids need not support monthly point analysis.
  await evaluate(
    `(()=>{const s=document.querySelector('.detective-controls select');s.value='temperature_range_trend';s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await waitFor(`document.querySelector('.discovery-card')?.textContent.includes('T2M_RANGE')`);
  assert.equal(await evaluate(`document.querySelectorAll('.drilldown-link').length`), 0);
  // Controlled HTTP failure: the real service is left running and no discoveries are fabricated.
  const failRequests = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Fetch.requestPaused')
      send('Fetch.fulfillRequest', {
        requestId: message.params.requestId,
        responseCode: 503,
        responseHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Access-Control-Allow-Origin', value: 'http://localhost:3000' },
        ],
        body: Buffer.from(
          JSON.stringify({ detail: 'Controlled browser test: grid temporarily unavailable' }),
        ).toString('base64'),
      });
  };
  socket.addEventListener('message', failRequests);
  await send('Fetch.enable', {
    patterns: [
      { urlPattern: 'http://localhost:8000/api/detective/hotspots*', requestStage: 'Request' },
    ],
  });
  await evaluate(`document.querySelector('.detective-controls button').click()`);
  await waitFor(
    `document.querySelector('.error-message')?.textContent.includes('grid temporarily unavailable')`,
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('.region-item,.discovery-card').length`),
    0,
  );
  await send('Fetch.disable');
  socket.removeEventListener('message', failRequests);
  await evaluate(`document.querySelector('.error-message button').click()`);
  await waitFor(
    `document.querySelectorAll('.region-item').length>0 && !document.querySelector('.error-message')`,
  );
  // Return through a standard coordinate explorer: its explicit demo still works.
  await navigate('http://localhost:3000/explore');
  await waitFor(
    `document.querySelector('.chart-panel') && document.querySelector('.mode-notice').textContent.includes('fictional')`,
  );
  const unexpected = errors.filter((e) => !e.includes('Failed to load resource'));
  await writeFile(
    new URL('../artifacts/detective-browser-results.json', import.meta.url),
    JSON.stringify(
      {
        checks: [
          'actual backend hotspot coordinates',
          'list selection',
          'pointer marker selection',
          'rotating WebGL Earth',
          'mobile no overflow',
          'actual automatic NASA point drilldown',
          'precipitation layer warning and caution styling',
          'unsupported T2M_RANGE point action disabled',
          'HTTP 503 clears stale regions and retry restores real results',
          'existing coordinate demo',
        ],
        clickedMarker: visible.rank,
        drilldown: href,
        runtimeErrors: unexpected,
      },
      null,
      2,
    ),
  );
  assert.deepEqual(unexpected, []);
  console.log(
    'Earth Detective browser checks passed with real backend regions and NASA point drilldown.',
  );
} catch (error) {
  console.error('Browser errors:', errors);
  throw error;
} finally {
  socket.close();
}
