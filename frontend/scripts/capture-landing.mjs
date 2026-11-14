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
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setEmulatedMedia', { features: [] });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1672,
    height: 941,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: 'http://localhost:3000' });
  await waitFor(
    `document.querySelector('.earth-canvas canvas') && document.querySelector('button[aria-label="Pause globe animation"]')`,
  );
  await waitFor(
    `performance.getEntriesByType('resource').filter(r => /earth-(day|night|clouds)\\.jpg/.test(r.name)).length >= 3`,
  );
  await evaluate('new Promise(resolve => setTimeout(resolve, 2200))');
  await screenshot('landing-desktop');
  await evaluate(`document.querySelector('button[aria-label="Pause globe animation"]').click()`);
  await waitFor(
    `document.querySelector('button[aria-label="Resume globe animation"]')?.getAttribute('aria-pressed') === 'true'`,
  );
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  const canvasBox = await evaluate(`(()=>{const r=document.querySelector('.earth-canvas canvas').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  const beforeDrag = await send('Page.captureScreenshot', {format:'png',clip:{x:canvasBox.x-70,y:canvasBox.y-70,width:140,height:140,scale:1}});
  await send('Input.dispatchMouseEvent', {type:'mousePressed',x:canvasBox.x,y:canvasBox.y,button:'left',clickCount:1});
  for(let step=1;step<=8;step++) await send('Input.dispatchMouseEvent', {type:'mouseMoved',x:canvasBox.x+step*12,y:canvasBox.y,button:'left',buttons:1});
  await send('Input.dispatchMouseEvent', {type:'mouseReleased',x:canvasBox.x+96,y:canvasBox.y,button:'left',clickCount:1});
  await evaluate('new Promise(resolve=>setTimeout(resolve,700))');
  const afterDrag = await send('Page.captureScreenshot', {format:'png',clip:{x:canvasBox.x-70,y:canvasBox.y-70,width:140,height:140,scale:1}});
  assert.notEqual(beforeDrag.data, afterDrag.data, 'Dragging should change the rendered Earth view.');
  await evaluate(`document.querySelector('.cinematic-actions a[href="#mystery"]').click()`);
  await waitFor(`location.hash === '#mystery'`);
  await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
  await screenshot('landing-desktop-full', true);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
  await evaluate('new Promise(resolve => setTimeout(resolve, 600))');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await screenshot('landing-mobile', true);
  for (const width of [320, 768, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 701 });
    await evaluate('new Promise(resolve => setTimeout(resolve, 400))');
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `Horizontal overflow at ${width}px`);
    await screenshot(`landing-${width}`);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await waitFor(`document.querySelector('.earth-visual').classList.contains('globe-paused')`);
  await waitFor(`document.querySelector('[data-globe-pause]')?.disabled === true`);
  await screenshot('landing-reduced-motion');
  await send('Emulation.setEmulatedMedia', { features: [] });
  await evaluate(`document.querySelector('.earth-view-button').click()`);
  await waitFor(
    `document.querySelector('.earth-fallback-label')?.textContent.includes('Still view')`,
  );
  await screenshot('landing-static-fallback');
  // Force WebGL unavailable before reload to exercise feature detection, not just the toggle.
  const injection = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); };`,
  });
  await send('Page.navigate', { url: 'http://localhost:3000' });
  await waitFor(
    `document.querySelector('.earth-fallback-label')?.textContent.includes('3D unavailable')`,
  );
  await screenshot('landing-no-webgl');
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injection.identifier });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(`document.querySelector('.cinematic-actions a[href="/explore"]').click()`);
  await waitFor(
    `location.pathname === '/explore' && document.querySelector('.map-frame .leaflet-container') && document.querySelector('.recharts-wrapper')`,
  );
  await screenshot('explorer-regression');
  // Runtime errors are actionable; network tile failures may be reported separately.
  const appErrors = errors.filter((error) => !error.includes('Failed to load resource'));
  await writeFile(
    new URL('../artifacts/browser-results.json', import.meta.url),
    JSON.stringify(
      {
        checked: [
          'desktop',
          'mobile',
      '320/768/1280px responsive widths',
          'no horizontal overflow',
          'pause',
      'pointer drag changes Earth view',
          'mystery anchor',
          'reduced motion',
          'still view',
          'WebGL unavailable',
          'explorer navigation and map/chart mount',
        ],
        runtimeErrors: appErrors,
        consoleErrors: errors,
      },
      null,
      2,
    ),
  );
  assert.deepEqual(appErrors, []);
  console.log('Browser checks passed; screenshots saved in frontend/artifacts/.');
} catch (error) {
  console.error('Browser console:', errors);
  throw error;
} finally {
  socket.close();
}
