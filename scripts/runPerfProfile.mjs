#!/usr/bin/env node
// @ts-check
import { spawn, execFileSync } from 'child_process';
import path from 'path';
import http from 'http';

function parseArgs(argv) {
  const out = { arena: 'rooftops', bots: '4', difficulty: 'hard', duration: '30' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf('=');
    let key, val;
    if (eq > 0) {
      key = a.slice(2, eq);
      val = a.slice(eq + 1);
    } else if (a.startsWith('--')) {
      key = a.slice(2);
      val = argv[++i];
    } else continue;
    if (key in out) out[key] = val;
  }
  return out;
}

function getCommitSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function waitForUrl(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else if (Date.now() - start > timeoutMs) reject(new Error(`Timed out waiting for ${url} (last status ${res.statusCode})`));
        else setTimeout(tick, 250);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`Timed out waiting for ${url}`));
        else setTimeout(tick, 250);
      });
      req.setTimeout(2000, () => req.destroy());
    };
    tick();
  });
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`));
    });
    child.on('error', reject);
  });
}

function killProcess(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {
    // best effort
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const commit = getCommitSha();
  const buildDir = 'dist-perf';
  const outDir = path.join(process.cwd(), 'test-results', 'perf');
  const port = '4175';
  const baseUrl = `http://localhost:${port}/bunnybrawl/`;

  console.log(`\n=== Perf profile ===`);
  console.log(`scenario: ${opts.arena} · ${opts.bots} bots ${opts.difficulty} · ${opts.duration}s`);
  console.log(`commit:   ${commit}`);
  console.log(`out:      ${outDir}/report.md\n`);

  console.log('[1/4] Building perf bundle (sourcemaps → dist-perf/)…');
  await run('npm', ['run', 'perf:build']);

  console.log(`[2/4] Starting preview server on port ${port}…`);
  const preview = spawn('npx', ['vite', 'preview', '--outDir', buildDir, '--port', port], {
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
  let previewClosed = false;
  preview.on('exit', () => { previewClosed = true; });
  preview.stderr?.on('data', (d) => process.stderr.write(d));

  const cleanup = () => {
    if (!previewClosed) killProcess(preview.pid);
  };

  try {
    await waitForUrl(baseUrl);

    console.log('[3/4] Running playwright spec…');
    await run('npx', ['playwright', 'test', '--config=playwright.perf.config.ts', 'e2e/perf-profile.spec.ts', '--reporter=line', '--retries=0'], {
      env: {
        ...process.env,
        PERF_ARENA: opts.arena,
        PERF_BOTS: opts.bots,
        PERF_DIFFICULTY: opts.difficulty,
        PERF_DURATION_S: opts.duration,
        PERF_OUT_DIR: outDir,
        PERF_COMMIT: commit,
        PERF_BUILD_DIR: buildDir,
        PLAYWRIGHT_BASE_URL: baseUrl,
      },
    });

    console.log('[4/4] Analyzing artifacts…');
    await run('node', ['scripts/analyzePerfProfile.mjs', '--in', outDir]);

    console.log(`\n✓ Done. Open ${path.join(outDir, 'report.md')}\n`);
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error('\n✗ Perf profile failed:', err.message);
  process.exit(1);
});
