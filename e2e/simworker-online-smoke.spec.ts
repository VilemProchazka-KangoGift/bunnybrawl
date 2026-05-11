import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

/**
 * Phase 2 online smoke matrix: `?simWorker=on` host + `?simWorker=on` guest.
 * Confirms the sim-in-worker netcode path reaches phase=playing on both
 * peers and survives a 25s match window under both clean and adverse
 * simulated network conditions.
 *
 * Tag: `@online` — Trystero MQTT signaling is flaky on free brokers; the
 * spec uses Playwright's retries (2 by default, 3 in CI) to handle the
 * known signaling jitter.
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
}

async function createPair(browser: Browser, query: string): Promise<Pair> {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  const hostErrors: string[] = [];
  const guestErrors: string[] = [];
  // Filter known-benign console noise: Howler autoplay warning, devtools
  // tip, prebundled-howler info logs. Capture everything else for the
  // assertion at end of match.
  const isBenign = (t: string): boolean =>
    t.includes('HTML5 Audio pool') ||
    t.includes('react-devtools') ||
    t.includes('AudioContext was not allowed to start') ||
    t.includes('autoplay policy') ||
    // Trystero MQTT signaling: free brokers (test.mosquitto.org,
    // broker.emqx.io, etc.) drop connections intermittently. Trystero
    // auto-reconnects; WebRTC stays alive in the meantime. Pre-existing,
    // unrelated to Phase 2.
    t.includes('mqtt') ||
    t.includes('mosquitto');
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
  return { host, guest, hostCtx, guestCtx, hostErrors, guestErrors };
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
  await expect(startBtn.or(readyBtn)).toBeVisible({ timeout: 15000 });
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

async function runMatrixRow(browser: Browser, query: string, label: string, opts: { matchScreenMs?: number; phaseMs?: number; soakMs?: number } = {}): Promise<void> {
  const matchScreenMs = opts.matchScreenMs ?? 20000;
  const phaseMs = opts.phaseMs ?? 25000;
  const soakMs = opts.soakMs ?? 8000;
  const pair = await createPair(browser, query);
  try {
    const code = await hostCreateRoom(pair.host);
    await guestJoin(pair.guest, code);
    await waitForLobby(pair.host);
    await waitForLobby(pair.guest);

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

  test('adverse network — ?simLatency=80 jitter=20 loss=5 on both peers', async ({ browser }) => {
    await runMatrixRow(
      browser,
      '?simWorker=on&simLatency=80&simJitter=20&simLoss=5',
      'simLatency=80',
      { matchScreenMs: 45000, phaseMs: 45000, soakMs: 10000 },
    );
  });
});
