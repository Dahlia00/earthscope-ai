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
async function waitFor(expression, timeout=20000) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    try{if(await evaluate(`Boolean(${expression})`))return;}
    catch(error){if(!error.message.includes('-32000')&&!error.message.includes('Execution context was destroyed'))throw error;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.fail(`Timed out: ${expression}`);
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
  await waitFor(`location.href === ${JSON.stringify(new URL(url).href)} && document.readyState === 'complete'`);
}
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
const report = { production: true, checks: [], layout: [], runtimeErrors: [], tiles: [] };
socket.addEventListener('message', (event) => {
  const m = JSON.parse(event.data);
  if (
    m.method === 'Network.responseReceived' &&
    m.params.response.url.startsWith('https://tile.openstreetmap.org/')
  )
    report.tiles.push({ url: m.params.response.url, status: m.params.response.status });
});
async function selectValue(selector, value) {
  await evaluate(
    `(()=>{const element=document.querySelector(${JSON.stringify(selector)});element.value=${JSON.stringify(value)};element.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
}
try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await navigate('about:blank');
  errors.length = 0;
  await send('Emulation.setEmulatedMedia', { features: [] });
  // Check direct route loads at narrow phone through wide desktop sizes.
  for (const path of ['/', '/explore', '/detective']) {
    await navigate('http://localhost:3000' + path);
    await waitFor(`document.querySelector('#main')&&document.querySelector('.site-header nav')`);
    for (const width of [320, 390, 768, 1280, 1672]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 701,
      });
      await evaluate('new Promise(resolve=>setTimeout(resolve,250))');
      const layout = await evaluate(
        `({width:innerWidth,scroll:document.documentElement.scrollWidth,navGap:getComputedStyle(document.querySelector('.site-header nav')).gap})`,
      );
      report.layout.push({ path, ...layout });
    }
  }
  const overflow = report.layout.filter((l) => l.scroll > l.width + 1);
  report.overflow = overflow;
  // Verify actual free basemap imagery with a normal initial viewport, no tile prefetch.
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate('http://localhost:3000/explore');
  await waitFor(
    `Array.from(document.querySelectorAll('.leaflet-tile-loaded')).some(i=>i.naturalWidth===256 && i.src.startsWith('https://tile.openstreetmap.org/'))`,
    30000,
  );
  assert.ok(
    await evaluate(
      `document.querySelector('.leaflet-control-attribution').textContent.includes('OpenStreetMap')`,
    ),
  );
  assert.equal(
    await evaluate(`document.querySelector('.leaflet-container').innerHTML.includes('cartocdn')`),
    false,
  );
  await evaluate('new Promise(resolve=>setTimeout(resolve,400))');
  await screenshot('review-explorer-basemap', true);
  report.checks.push('OSM raster images loaded, attribution visible, no CARTO tiles');
  // A single map click should update coordinates and invalidate old results.
  const before = await evaluate(
    `Array.from(document.querySelectorAll('input[type="number"]')).slice(0,2).map(i=>i.value)`,
  );
  const point = await evaluate(
    `(()=>{const r=document.querySelector('.leaflet-container').getBoundingClientRect();return{x:r.x+r.width/2+20,y:r.y+r.height/2+15};})()`,
  );
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1,
  });
  await waitFor(`!document.querySelector('.chart-panel')`);
  const after = await evaluate(
    `Array.from(document.querySelectorAll('input[type="number"]')).slice(0,2).map(i=>i.value)`,
  );
  assert.notDeepEqual(after, before);
  report.checks.push('map selection updates coordinates and clears previous observations');
  // Follow all shared navigation paths as real client-side clicks.
  for (const [href, path, hash] of [
    ['/', '/', ''],
    ['/detective', '/detective', ''],
    ['/explore', '/explore', ''],
    ['/#about', '/', '#about'],
  ]) {
    await waitFor(`document.querySelector('.site-header nav a[href="${href}"]')`);
    await evaluate(
      `window.scrollTo({top:0,behavior:'instant'});document.querySelector('.site-header nav a[href="${href}"]').click()`,
    );
    await waitFor(
      `location.pathname===${JSON.stringify(path)}&&location.hash===${JSON.stringify(hash)}`,
    );
    if (hash)
      await waitFor(
        `document.querySelector('#about')&&document.querySelector('#about').getBoundingClientRect().top<innerHeight`,
      );
  }
  report.checks.push('Home / Detective / Explorer / About shared navigation');
  // Hero illustration labels must remain legible and explicitly fictional.
  await navigate('http://localhost:3000');
  await waitFor(`document.querySelectorAll('.signal-label').length===3`);
  assert.ok(
    await evaluate(
      `Array.from(document.querySelectorAll('.signal-label')).every(e=>e.textContent.includes('Illustrative')&&parseFloat(getComputedStyle(e).fontSize)>=9)`,
    ),
  );
  report.checks.push('all hero signals explicitly illustrative, labels at least 9px');
  // Exercise real supported non-temperature observations and correct trend units.
  await navigate('http://localhost:3000/explore');
  await waitFor(`document.querySelector('.mode-switch')`);
  await evaluate(
    `Array.from(document.querySelectorAll('.mode-switch button')).find(b=>b.textContent.includes('Live API')).click()`,
  );
  await waitFor(`!document.querySelector('.analyze-button').disabled`);
  for (const variable of ['RH2M', 'PRECTOTCORR']) {
    console.log('Reviewing real variable', variable);
    await selectValue('.variable-label select', variable);
    await evaluate(`document.querySelector('.analyze-button').click()`);
    await waitFor(`document.querySelector('.evidence-panel')`, 55000);
    assert.ok(
      await evaluate(
        `document.querySelector('.evidence-panel').textContent.includes('${variable}')`,
      ),
    );
    assert.ok(
      await evaluate(
        `document.querySelector('.stat-number').textContent.includes('${variable === 'RH2M' ? 'percentage points/decade' : 'mm/day/decade'}')`,
      ),
    );
  }
  report.checks.push('real Ottawa humidity and precipitation, accurate distinct units');
  // WebGL-unavailable devices retain usable discovery controls and real region data.
  const injection = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};`,
  });
  await navigate('http://localhost:3000/detective');
  await waitFor(
    `document.querySelector('.detective-fallback')&&document.querySelectorAll('.region-item').length===10`,
  );
  await evaluate(`document.querySelectorAll('.region-item')[1].click()`);
  await waitFor(`document.querySelector('.discovery-card-top').textContent.includes('REGION 2')`);
  await screenshot('review-detective-no-webgl', true);
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injection.identifier });
  report.checks.push('WebGL unavailable: real region list and selection remain usable');
  report.runtimeErrors = errors.filter((e) => !e.includes('Failed to load resource'));
  await writeFile(
    new URL('../artifacts/submission-browser-review.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
  assert.deepEqual(report.runtimeErrors, []);
  assert.deepEqual(overflow, [], 'Responsive overflow found; see report');
  console.log('Submission production browser review passed.');
} catch (error) {
  await writeFile(
    new URL('../artifacts/submission-browser-review.json', import.meta.url),
    JSON.stringify({ ...report, runtimeErrors: errors }, null, 2),
  );
  console.error(error.message);
  throw error;
} finally {
  socket.close();
}
