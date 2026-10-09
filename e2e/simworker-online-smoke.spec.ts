import type { HostAuthority } from '../src/engine/net/hostAuthority';
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

/**
 * Phase 2 online smoke matrix: `?simWorker=on` host + `?simWorker=on` guest.
 * Confirms the sim-in-worker netcode path reaches phase=playing on both
 * peers and survives a 25s match window under both clean and adverse
 * simulated network conditions.
 *
 * Tag: `@online` — the smoke runner builds with a local MQTT relay and
 * starts that relay through Playwright, avoiding public broker variability.
 *
 * Runs against `vite preview` (production build) — `?simWorker=on` is
 * broken in dev per the known top-level-await ordering issue, but prod
 * is fully wired.
 */

interface Pair {
  host: Page;
  guest: Page;
  hostCtx: BrowserContext;
  guestCtx: BrowserContext;
  hostErrors: string[];
  guestErrors: string[];
  hostSocketUrls: string[];
  guestSocketUrls: string[];
}

async function createPair(browser: Browser, query: string, forceMessages = false): Promise<Pair> {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  if (forceMessages) {
    for (const context of [hostCtx, guestCtx]) {
      await context.addInitScript(() => Object.defineProperty(window, 'crossOriginIsolated', { value: false }));
    }
  }
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  const hostErrors: string[] = [];
  const guestErrors: string[] = [];
  const hostSocketUrls: string[] = [];
  const guestSocketUrls: string[] = [];
  // Filter known-benign console noise: Howler autoplay warning, devtools
  // tip, prebundled-howler info logs. Capture everything else for the
  // assertion at end of match.
  const isBenign = (t: string): boolean =>
    t.includes('HTML5 Audio pool') ||
    t.includes('react-devtools') ||
    t.includes('AudioContext was not allowed to start') ||
    t.includes('autoplay policy');
  host.on('websocket', socket => hostSocketUrls.push(socket.url()));
  guest.on('websocket', socket => guestSocketUrls.push(socket.url()));
  host.on('console', (m) => {
    if (m.type() === 'error' && !isBenign(m.text())) hostErrors.push(m.text());
  });
  guest.on('console', (m) => {
    if (m.type() === 'error' && !isBenign(m.text())) guestErrors.push(m.text());
  });
  host.on('pageerror', (e) => hostErrors.push('pageerror: ' + e.message));
  guest.on('pageerror', (e) => guestErrors.push('pageerror: ' + e.message));
  await host.goto('/' + query);
  await guest.goto('/' + query);
  return { host, guest, hostCtx, guestCtx, hostErrors, guestErrors, hostSocketUrls, guestSocketUrls };
}

async function closePair(pair: Pair): Promise<void> {
  await pair.hostCtx.close().catch(() => {});
  await pair.guestCtx.close().catch(() => {});
}

async function openOnlineModal(page: Page): Promise<void> {
  await page.getByTestId('online-btn').click();
  await page.waitForTimeout(200);
}

async function hostCreateRoom(page: Page): Promise<string> {
  // Velocity/release checks require predictable terrain, not a random slippery arena.
  await page.evaluate(() => window.__bunnyTest!.gameStore().getState().setMatchSettings({ arenaId: 'meadow' }));
  await openOnlineModal(page);
  await page.getByTestId('online-name-input').fill('Host');
  await page.getByTestId('online-create-btn').click();
  const codeEl = page.getByTestId('online-room-code');
  await expect(codeEl).toBeVisible({ timeout: 15000 });
  const code = await codeEl.textContent();
  expect(code).toMatch(/^[A-Z2-9]{3}$/);
  return code!;
}

async function guestJoin(page: Page, code: string): Promise<void> {
  await openOnlineModal(page);
  await page.getByTestId('online-name-input').fill('Guest');
  await page.getByTestId('online-join-btn').click();
  await page.getByTestId('online-code-input').fill(code);
  await page.getByTestId('online-join-submit').click();
}

async function waitForLobby(page: Page): Promise<void> {
  const startBtn = page.getByTestId('online-start-btn');
  const readyBtn = page.getByTestId('online-ready-btn');
  // The UI enters its slow-connection stage at 15s; give WebRTC time to finish.
  await expect(startBtn.or(readyBtn)).toBeVisible({ timeout: 30000 });
}

async function isRemoteSim(page: Page): Promise<boolean> {
  // Prod build mangles class names, so we can't check constructor.name.
  // `isRemoteSim()` is the canonical discriminator NetMatch uses — the
  // proxy returns true, GameLoop returns false.
  return await page.evaluate(() => {
    const t = (window as unknown as { __bunnyTest?: { gameLoop?: () => { isRemoteSim?: () => boolean } } }).__bunnyTest;
    return t?.gameLoop?.()?.isRemoteSim?.() === true;
  });
}

async function getPhase(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const t = (window as unknown as { __bunnyTest?: { state?: () => { phase?: string } } }).__bunnyTest;
    return t?.state?.()?.phase ?? null;
  });
}

async function runMatrixRow(browser: Browser, query: string, label: string, opts: { matchScreenMs?: number; phaseMs?: number; soakMs?: number; forceMessages?: boolean } = {}): Promise<void> {
  const matchScreenMs = opts.matchScreenMs ?? 20000;
  const phaseMs = opts.phaseMs ?? 25000;
  const soakMs = opts.soakMs ?? 8000;
  const pair = await createPair(browser, query, opts.forceMessages);
  try {
    const relayUrl = process.env.VITE_E2E_MQTT_URL;
    expect(relayUrl, 'online smoke must use the local MQTT relay').toBeTruthy();
    const code = await hostCreateRoom(pair.host);
    await guestJoin(pair.guest, code);
    await waitForLobby(pair.host);
    await waitForLobby(pair.guest);
    expect(pair.hostSocketUrls, `${label} host relay`).toContain(relayUrl);
    expect(pair.guestSocketUrls, `${label} guest relay`).toContain(relayUrl);

    // Start the match. The "start" button label varies; the host's
    // online-start-btn is the canonical entry.
    await pair.host.getByTestId('online-start-btn').click();
    await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: matchScreenMs });
    await expect(pair.guest.getByTestId('match-screen')).toBeVisible({ timeout: matchScreenMs });

    // Both peers should be running on the sim-in-worker proxy.
    expect(await isRemoteSim(pair.host), `${label} host isRemoteSim`).toBe(true);
    expect(await isRemoteSim(pair.guest), `${label} guest isRemoteSim`).toBe(true);

    // Wait past loading + countdown. Phase 2 host:initEngine sets up the
    // worker before the LOADED handshake; takes a few seconds in prod.
    await pair.host.waitForFunction(
      () => (window as unknown as { __bunnyTest?: { state?: () => { phase?: string } } })
        .__bunnyTest?.state?.()?.phase === 'playing',
      undefined,
      { timeout: phaseMs },
    );
    await pair.guest.waitForFunction(
      () => (window as unknown as { __bunnyTest?: { state?: () => { phase?: string } } })
        .__bunnyTest?.state?.()?.phase === 'playing',
      undefined,
      { timeout: phaseMs },
    );

    await pair.host.waitForFunction(() => window.__bunnyTest?.state()?.countdown === 0);
    // The guest owns P2. Both event edges are deliberately sent in one JS
    // task, between GuestLoop input reads; keyboard latching must retain it.
    await pair.host.evaluate(() => {
      const match = window.__bunnyTest!.netMatch() as unknown as { hostAuthority: HostAuthority };
      const authority = match.hostAuthority;
      const read = authority.getNetworkInputs.bind(authority);
      const observed = window as Window & { __guestJumpReads: number };
      observed.__guestJumpReads = 0;
      authority.getNetworkInputs = () => {
        const inputs = read();
        if (inputs.get('P2')?.jump) observed.__guestJumpReads++;
        return inputs;
      };
    });
    await pair.guest.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
    });
    await pair.host.waitForFunction(() => (window as Window & { __guestJumpReads?: number }).__guestJumpReads === 1, undefined, { timeout: 8000 });
    // Exercise held movement and release over real WebRTC, not just an idle soak.
    // Let the latched jump land before choosing a clear movement direction.
    await pair.host.waitForFunction(() => ['idle', 'run'].includes(window.__bunnyTest!.state()!.players.find(p => p.id === 'P2')!.state), undefined, { timeout: 8000 });
    // Meadow spawns can be flush against either side of a stump.
    const direction = await pair.host.evaluate(() => {
      const player = window.__bunnyTest!.state()!.players.find(p => p.id === 'P2')!;
      const arena = window.__bunnyTest!.gameLoop()!.getArena();
      let leftGap = player.x, rightGap = arena.width - player.x - player.width;
      for (const platform of arena.platforms) {
        if (player.y + player.height <= platform.y || player.y >= platform.y + platform.height) continue;
        if (platform.x >= player.x + player.width) rightGap = Math.min(rightGap, platform.x - player.x - player.width);
        if (platform.x + platform.width <= player.x) leftGap = Math.min(leftGap, player.x - platform.x - platform.width);
      }
      return leftGap > rightGap ? -1 : 1;
    });
    // The player may land beside a different obstacle between mirror reads.
    // Try the opposite direction if the first is blocked; both still require
    // signed authoritative velocity over the real guest input transport.
    let moved = false;
    let movementError: unknown;
    for (const candidate of [direction, -direction]) {
      const movementKey = candidate < 0 ? 'a' : 'd';
      await pair.guest.keyboard.down(movementKey);
      try {
        await pair.host.waitForFunction(direction => (window.__bunnyTest?.state()?.players.find(p => p.id === 'P2')?.vx ?? 0) * direction > 0, candidate, { timeout: 8000 });
        moved = true;
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'TimeoutError') throw error;
        movementError = error;
      } finally { await pair.guest.keyboard.up(movementKey); }
      if (moved) break;
    }
    if (!moved) {
      console.error('Held guest input timeout', await pair.host.evaluate(() => {
        const state = window.__bunnyTest!.state();
        const match = window.__bunnyTest!.netMatch() as unknown as { hostAuthority: HostAuthority };
        const player = state?.players.find(p => p.id === 'P2');
        return { phase: state?.phase, countdown: state?.countdown,
          player: player && { x: player.x, y: player.y, vx: player.vx, vy: player.vy, state: player.state, active: player.active },
          input: match.hostAuthority.getNetworkInputs().get('P2') };
      }));
      throw movementError;
    }
    await pair.host.waitForFunction(() => Math.abs(window.__bunnyTest?.state()?.players.find(p => p.id === 'P2')?.vx ?? 1) < 1, undefined, { timeout: 8000 });
    expect(await pair.host.evaluate(() => (window as Window & { __guestJumpReads: number }).__guestJumpReads)).toBe(1);

    // Let the match run a bit. Adverse network rows get extra time so
    // the host's broadcast loop + guest's interp can settle.
    await pair.host.waitForTimeout(soakMs);

    // Both peers still in phase=playing (no early match-over from a
    // worker crash or transport bail).
    expect(await getPhase(pair.host), `${label} host post-soak phase`).toBe('playing');
    expect(await getPhase(pair.guest), `${label} guest post-soak phase`).toBe('playing');

    // No unexpected errors logged. The known-benign filter handles the
    // autoplay + audio-pool warnings.
    expect(pair.hostErrors, `${label} host console errors:\n${pair.hostErrors.join('\n')}`).toEqual([]);
    expect(pair.guestErrors, `${label} guest console errors:\n${pair.guestErrors.join('\n')}`).toEqual([]);
  } finally {
    await closePair(pair);
  }
}

test.describe('Phase 2 simWorker online smoke', { tag: '@online' }, () => {
  test.setTimeout(180000);

  test('baseline — both peers on ?simWorker=on, no simulated network', async ({ browser }) => {
    await runMatrixRow(browser, '?simWorker=on', 'baseline');
  });

  test('message fallback — online input without shared memory', async ({ browser }) => {
    await runMatrixRow(browser, '?simWorker=on', 'messages', { forceMessages: true });
  });

  test('adverse network — ?simLatency=80 jitter=20 loss=5 on both peers', async ({ browser }) => {
    await runMatrixRow(
      browser,
      '?simWorker=on&simLatency=80&simJitter=20&simLoss=5',
      'simLatency=80',
      { matchScreenMs: 45000, phaseMs: 45000, soakMs: 10000 },
    );
  });
});
