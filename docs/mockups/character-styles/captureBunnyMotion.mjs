import { chromium } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const directory = dirname(fileURLToPath(import.meta.url));
const server = process.env.CHARACTER_MOCKUP_URL ?? 'http://127.0.0.1:4193';
const temporary = await mkdtemp(join(tmpdir(), 'pocket-bunny-motion-'));
const browser = await chromium.launch({ headless: true });
const frames = [
  ...Array.from({ length: 8 }, (_, i) => ({ pose: 'run', frame: i & 3, dx: i * 10, dy: 0 })),
  ...[-15, -30, -35, -25].map((dy, i) => ({ pose: 'airborne', frame: 0, dx: 80 + i * 9, dy })),
  { pose: 'fastfall', frame: 0, dx: 120, dy: -10 },
  { pose: 'fastfall', frame: 0, dx: 125, dy: 6 },
  { pose: 'idle', frame: 0, dx: 130, dy: 0 },
  { pose: 'idle', frame: 0, dx: 130, dy: 0 },
];

async function visit(page, params) {
  const address = `${server}/bunnybrawl/docs/mockups/character-styles/render.html?${new URLSearchParams(params)}`;
  const response = await page.goto(address);
  if (!response?.ok()) throw new Error(`${address}: HTTP ${response?.status()}`);
  await page.locator('html[data-ready="true"]').waitFor();
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 997 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const time of ['day', 'night']) {
    await visit(page, { style: 'pocket-bunny-rig', time, pose: 'run', frame: '2' });
    await page.screenshot({ path: join(directory, `pocket-bunny-rig-${time}.png`), fullPage: true });
  }
  for (const [index, keyframe] of frames.entries()) {
    await visit(page, { style: 'pocket-bunny-rig', time: 'day', ...keyframe });
    await page.screenshot({ path: join(temporary, `frame-${String(index).padStart(2, '0')}.png`),
      clip: { x: 185, y: 255, width: 480, height: 330 } });
  }
  if (errors.length) throw new Error(errors.join('; '));
  const output = join(directory, 'pocket-bunny-motion.gif');
  const ffmpeg = spawnSync('ffmpeg', [
    '-y', '-framerate', '8', '-i', join(temporary, 'frame-%02d.png'),
    '-vf', 'fps=8,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3',
    '-loop', '0', output,
  ], { encoding: 'utf8' });
  if (ffmpeg.status !== 0) throw new Error(ffmpeg.stderr);
  console.log(`Saved day/night captures and ${output}`);

  for (const style of ['pocket-plush', 'pocket-bunny-rig']) {
    await visit(page, { style, time: 'day', pose: 'run', frame: '0' });
    const samples = [];
    for (let i = 0; i < 5; i++) {
      samples.push(await page.evaluate(() => globalThis.benchmarkMockup(400)));
    }
    samples.sort((a, b) => a - b);
    console.log(`${style}: median ${samples[2].toFixed(3)} ms / full renderer frame (5 × 400 warmed frames)`);
  }
  await page.close();
} finally {
  await browser.close();
  await rm(temporary, { recursive: true, force: true });
}
