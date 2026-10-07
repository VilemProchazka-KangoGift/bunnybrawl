import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const server = process.env.WINTER_LAKE_URL ?? 'http://127.0.0.1:4222/bunnybrawl/';
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = new URL('?arena=winter_lake&bots=4&simWorker=off', server);
  const response = await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  if (!response?.ok()) throw new Error(`Arena load: HTTP ${response?.status()}`);
  await page.waitForFunction(() => window.__bunnyTest?.state()?.countdown === 0, null, { timeout: 30000 });
  await page.addStyleTag({ content: 'canvas.hud-canvas { visibility: hidden }' });

  const characters = await page.evaluate(async () => {
    const { getAllCharacters } = await import('/bunnybrawl/src/engine/characters/defaults.ts');
    const byName = new Map(getAllCharacters().map(character => [character.name, character]));
    const state = window.__bunnyTest?.state();
    if (!state || state.players.length < 5) throw new Error('Five match players are required');
    window.__bunnyTest?.gameLoop()?.pause();
    const placements = [
      ['Bunny', 85, 540],
      ['Frog', 180, 625],
      ['Fox', 620, 325],
      ['Wolf', 900, 625],
      ['Panda', 1150, 390],
    ];
    for (let i = 0; i < placements.length; i++) {
      const [name, x, y] = placements[i];
      const player = state.players[i];
      const character = byName.get(name);
      if (!character) throw new Error(`Missing character: ${name}`);
      player.character = character;
      player.x = x;
      player.y = y;
      player.vx = 0;
      player.vy = 0;
      player.active = true;
      player.state = 'idle';
      player.invincibleTimer = 0;
    }
    state.carrots = [];
    state.springs = [];
    state.thorns = [];
    return placements.map(([name]) => name);
  });

  for (const [time, phase] of [['day', 0], ['night', 0.5]]) {
    await page.evaluate(phase => {
      const state = window.__bunnyTest?.state();
      if (state) state.dayPhase = phase;
    }, phase);
    await page.waitForTimeout(120);
    await page.screenshot({ path: join(directory, `live-current-${time}.png`) });
  }
  if (errors.length) throw new Error(errors.join('; '));
  console.log(`Captured current day/night with ${characters.join(', ')}`);
} finally {
  await browser.close();
}
