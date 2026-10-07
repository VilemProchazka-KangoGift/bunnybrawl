/* global window */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:4191/bunnybrawl/';
const count = Number(process.argv[3] ?? 40);
if (!Number.isInteger(count) || count < 2) throw new Error('Sample count must be an integer >= 2');
const browser = await chromium.launch();
const results = [];
try {
  for (const mode of ['sab', 'messages', 'main']) {
    const context = await browser.newContext();
    try {
      if (mode === 'messages') {
        // Emulate production without COOP/COEP while leaving workers enabled.
        await context.addInitScript(() => Object.defineProperty(window, 'crossOriginIsolated', { value: false }));
      }
      const page = await context.newPage();
      await page.goto(url + '?arena=meadow&bots=0&debug=perf' + (mode === 'main' ? '&simWorker=off' : ''));
      await page.waitForFunction(() => window.__bunnyTest?.state()?.countdown === 0);
      await page.evaluate(async (expectedMode) => {
        const loop = window.__bunnyTest.gameLoop();
        const remote = loop.isRemoteSim();
        if (remote !== (expectedMode !== 'main')) throw new Error('Unexpected simulation mode');
        if (remote && Boolean(loop.inputSabView) !== (expectedMode === 'sab')) throw new Error('Unexpected delivery path');
        const epoch = () => performance.timeOrigin + performance.now();
        let id = 0;
        let pending;
        let keyAt;
        window.addEventListener('keydown', e => { if (e.key === 'd') keyAt = epoch(); }, true);
        window.addEventListener('keyup', e => { if (e.key === 'd') keyAt = epoch(); }, true);
        if (!remote) {
          const input = loop.getPlayerInputs().get('P1');
          const read = input.getAction.bind(input);
          input.getAction = (...args) => {
            const action = read(...args);
            if (pending && pending.consumedAt === undefined && action.right === pending.pressed) pending.consumedAt = epoch();
            return action;
          };
          const render = loop.renderer.renderFrame.bind(loop.renderer);
          loop.renderer.renderFrame = (...args) => {
            render(...args);
            if (pending?.consumedAt !== undefined) {
              pending.resolve({ id: pending.id, consumedAt: pending.consumedAt, renderedAt: epoch() });
              pending = undefined;
            }
          };
        }
        window.__inputBenchmark = {
          async arm(pressed) {
            const requestId = ++id;
            let resolveSample;
            const sample = new Promise(resolve => { resolveSample = resolve; });
            if (remote) {
              await new Promise(resolve => {
                const listener = e => {
                  if (e.data?.type !== 'worker:inputProbe' || e.data.id !== requestId) return;
                  if (e.data.armed) resolve();
                  else { loop.worker.removeEventListener('message', listener); resolveSample(e.data); }
                };
                loop.worker.addEventListener('message', listener);
                loop.worker.postMessage({ type: 'host:inputProbe', id: requestId, slot: 'P1', button: 'right', pressed });
              });
            } else pending = { id: requestId, pressed, resolve: resolveSample };
            keyAt = undefined;
            this.sample = sample;
          },
          async read() {
            let timeout;
            let result;
            try { result = await Promise.race([this.sample, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Input probe timed out')), 3000); })]); }
            finally { clearTimeout(timeout); }
            if (keyAt === undefined) throw new Error('No keyboard event observed');
            return { inputMs: result.consumedAt - keyAt, renderSubmissionMs: result.renderedAt - keyAt };
          },
        };
      }, mode);
      const samples = [];
      for (let i = 0; i < count; i++) {
        const pressed = i % 2 === 0;
        await page.evaluate(pressed => window.__inputBenchmark.arm(pressed), pressed);
        // Vary event phase relative to vsync; avoid always probing the same phase.
        await page.waitForTimeout((i * 7) % 17);
        if (pressed) await page.keyboard.down('d'); else await page.keyboard.up('d');
        samples.push(await page.evaluate(() => window.__inputBenchmark.read()));
      }
      const summarize = field => {
        const values = samples.map(s => s[field]).sort((a, b) => a - b);
        const round = n => Math.round(n * 100) / 100;
        return { mean: round(values.reduce((a, b) => a + b, 0) / values.length), p50: round(values[Math.floor(values.length * 0.5)]), p95: round(values[Math.min(values.length - 1, Math.floor(values.length * 0.95))]) };
      };
      results.push({ mode, samples, inputMs: summarize('inputMs'), renderSubmissionMs: summarize('renderSubmissionMs') });
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
const report = { measuredAt: new Date().toISOString(), url, count, note: 'Input read in authoritative simulation; next render submission. Not OS input or display presentation latency. Main mode measures renderer-proxy submission; worker modes measure worker render completion.', results };
if (process.argv[4]) {
  await mkdir(dirname(process.argv[4]), { recursive: true });
  await writeFile(process.argv[4], JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
