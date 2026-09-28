import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { preview } from 'vite';
import { checkInitialBundle } from './checkInitialBundle.mjs';

const output = 'perf-runs/loading';
mkdirSync(output, { recursive: true });
copyFileSync('dist/.vite/initial-bundle.json', `${output}/initial-bundle.json`);
// Record the verdict before throwing so failed gates still have an artifact.
try {
  const result = checkInitialBundle();
  writeFileSync(`${output}/budget-result.json`, JSON.stringify(result, null, 2) + '\n');
} catch (error) {
  writeFileSync(`${output}/budget-failure.txt`, String(error) + '\n');
  throw error;
}

const server = await preview({ preview: { host: '127.0.0.1', port: 4187, strictPort: true } });
try {
  for (const flow of ['lobby', 'online']) {
    const lines = [];
    // A child process isolates the browser probe and preserves its nonzero exit status.
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        'scripts/measureColdLoad.mjs', 'http://127.0.0.1:4187/bunnybrawl/', '3', flow, 'constrained',
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, LOADING_BUDGET_REPORT: 'dist/.vite/initial-bundle.json' },
      });
      child.stdout.on('data', data => { lines.push(data); process.stdout.write(data); });
      const diagnostics = [];
      child.stderr.on('data', data => { diagnostics.push(data); process.stderr.write(data); });
      child.on('error', reject);
      child.on('close', code => {
        writeFileSync(`${output}/${flow}.ndjson`, Buffer.concat(lines));
        writeFileSync(`${output}/${flow}-diagnostics.txt`, Buffer.concat(diagnostics));
        if (code === 0) resolve();
        else reject(new Error(`Cold-load ${flow} probe failed (exit ${code})`));
      });
    });
  }
} finally {
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
