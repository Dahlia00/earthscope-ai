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
const responses = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (
    message.method === 'Network.responseReceived' &&
    message.params.response.url.startsWith('http://localhost:8000/api/')
  )
    responses.push({ url: message.params.response.url, status: message.params.response.status });
});
try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: 'http://localhost:3000/explore' });
  await waitFor(
    `document.querySelector('.analyze-button') && document.querySelector('.recharts-wrapper')`,
  );
  assert.ok(
    await evaluate(`document.querySelector('.mode-notice').textContent.includes('fictional')`),
  );
  await evaluate(
    `Array.from(document.querySelectorAll('.mode-switch button')).find(b=>b.textContent.includes('Live API')).click()`,
  );
  await waitFor(
    `document.querySelector('.mode-notice').textContent.includes('Backend connected') && !document.querySelector('.analyze-button').disabled`,
  );
  assert.equal(
    await evaluate(`document.querySelector('.variable-label select').options.length`),
    3,
  );
  await evaluate(`document.querySelector('.analyze-button').click()`);
  await waitFor(
    `document.querySelector('.origin-badge')?.textContent.includes('Live NASA response')`,
    55000,
  );
  const body = await evaluate('document.body.innerText');
  assert.ok(body.includes('NASA POWER (MERRA2)'));
  assert.ok(body.includes('432 valid'));
  assert.ok(body.includes('45.5, -75.625'));
  assert.ok(body.includes('Theil-Sen'));
  assert.ok(body.includes('0.00285'));
  assert.equal(await evaluate(`document.querySelectorAll('.recharts-line-curve').length`), 2);
  await screenshot('explorer-live-nasa', true);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await screenshot('explorer-live-nasa-mobile', true);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  // Exercise FastAPI's real insufficient-data error using the UI year control.
  await evaluate(
    `(()=>{const input=document.querySelector('input[min="1981"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'2024');input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await waitFor(
    `document.querySelector('input[min="1981"]').value === '2024' && !document.querySelector('.evidence-panel')`,
  );
  await evaluate(`document.querySelector('.analyze-button').click()`);
  await waitFor(
    `document.querySelector('[role="alert"]')?.textContent.includes('complete years')`,
    55000,
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".chart-panel,.evidence-panel").length'),
    0,
  );
  await screenshot('explorer-insufficient-data');
  // Restore Ottawa demo. The demo stays explicitly fictional, with no live evidence panel.
  await evaluate(
    `Array.from(document.querySelectorAll('.mode-switch button')).find(b=>b.textContent.includes('Demo data')).click()`,
  );
  await evaluate(
    `document.querySelector('button[aria-label="Restore Ottawa demo selection"]').click()`,
  );
  await evaluate(`document.querySelector('.analyze-button').click()`);
  await waitFor(
    `document.querySelector('.chart-panel') && document.querySelector('.mode-notice').textContent.includes('fictional')`,
  );
  assert.equal(await evaluate('document.querySelectorAll(".evidence-panel").length'), 0);
  const unexpected = errors.filter((error) => !error.includes('Failed to load resource'));
  await writeFile(
    new URL('../artifacts/api-browser-results.json', import.meta.url),
    JSON.stringify(
      {
        checks: [
          'demo to live mode',
          'three backend variables',
          'real Ottawa NASA analysis',
          'two backend-derived chart lines',
          'live origin and full evidence metadata',
          'mobile layout',
          'real backend insufficient-data 422',
          'demo remains separate',
        ],
        responses,
        runtimeErrors: unexpected,
      },
      null,
      2,
    ),
  );
  assert.deepEqual(unexpected, []);
  assert.ok(responses.some((r) => r.url.includes('/api/trends?') && r.status === 200));
  assert.ok(responses.some((r) => r.url.includes('/api/trends?') && r.status === 422));
  console.log(
    'Real FastAPI browser integration checks passed. Screenshots and report saved in artifacts/.',
  );
} catch (error) {
  console.error('Console errors:', errors);
  throw error;
} finally {
  socket.close();
}
