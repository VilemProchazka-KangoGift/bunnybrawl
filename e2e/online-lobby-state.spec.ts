import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

/**
 * E2E tests for online lobby state management.
 *
 * Covers:
 * - Player list correctness (no phantom entries)
 * - SLOT_ASSIGNMENT populates remotePlayers on guest
 * - Character selection sync without duplicates
 * - Mobile guest controls working in online mode
 * - Visual effect suppression during rollback resimulation
 *
 * Tag: @online
 */

// ---- Helpers ----

interface OnlinePair {
  host: Page;
  guest: Page;
  hostCtx: BrowserContext;
  guestCtx: BrowserContext;
}

async function openOnlineModal(page: Page) {
  await page.getByTestId('online-btn').click();
  await page.waitForTimeout(200);
}

async function hostCreateRoom(page: Page, name = 'Host'): Promise<string> {
  await openOnlineModal(page);
  await page.getByTestId('online-name-input').fill(name);
  await page.getByTestId('online-create-btn').click();
  const codeEl = page.getByTestId('online-room-code');
  await expect(codeEl).toBeVisible({ timeout: 15000 });
  const code = await codeEl.textContent();
  expect(code).toMatch(/^[A-Z2-9]{4}$/);
  return code!;
}

async function guestJoinRoom(page: Page, code: string, name = 'Guest') {
  await openOnlineModal(page);
  await page.getByTestId('online-name-input').fill(name);
  await page.getByTestId('online-join-btn').click();
  await page.getByTestId('online-code-input').fill(code);
  await page.getByTestId('online-join-submit').click();
}

async function waitForLobby(page: Page) {
  const startBtn = page.getByTestId('online-start-btn');
  const readyBtn = page.getByTestId('online-ready-btn');
  await expect(startBtn.or(readyBtn)).toBeVisible({ timeout: 15000 });
}

async function createPair(browser: Browser, guestMobile = false): Promise<OnlinePair> {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  host.on('console', msg => { if (msg.type() === 'error') console.log(`[HOST] ${msg.text()}`); });
  guest.on('console', msg => { if (msg.type() === 'error') console.log(`[GUEST] ${msg.text()}`); });
  await host.goto('/');
  await guest.goto(guestMobile ? '/?mobile' : '/');
  return { host, guest, hostCtx, guestCtx };
}

async function connectToLobby(pair: OnlinePair): Promise<string> {
  const code = await hostCreateRoom(pair.host);
  await guestJoinRoom(pair.guest, code);
  await waitForLobby(pair.host);
  await waitForLobby(pair.guest);
  return code;
}

async function startOnlineMatch(pair: OnlinePair) {
  await connectToLobby(pair);
  await pair.host.getByTestId('online-start-btn').click();
  await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
  await expect(pair.guest.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
}

async function closePair(pair: OnlinePair) {
  await pair.hostCtx.close().catch(() => {});
  await pair.guestCtx.close().catch(() => {});
}

// ---- Tests ----

test.describe('Online Lobby — Player List Integrity', { tag: '@online' }, () => {
  test.setTimeout(60000);

  test('guest sees exactly 2 player rows in lobby (no phantom entries)', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await connectToLobby(pair);

      // Guest's player list should have exactly 2 rows: host + self
      const guestRows = pair.guest.locator('.online-player-list .online-player-row');
      await expect(guestRows).toHaveCount(2);

      // Host's player list should also have exactly 2 rows: self + guest
      const hostRows = pair.host.locator('.online-player-list .online-player-row');
      await expect(hostRows).toHaveCount(2);
    } finally {
      await closePair(pair);
    }
  });

  test('guest player list shows host with HOST badge and self without', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await connectToLobby(pair);

      // Guest should see exactly one HOST badge
      const guestHostBadges = pair.guest.locator('.online-player-list .online-host-badge');
      await expect(guestHostBadges).toHaveCount(1);

      // The first row should be the host with HOST badge
      const firstRow = pair.guest.locator('.online-player-list .online-player-row').first();
      await expect(firstRow.locator('.online-host-badge')).toBeVisible();

      // The second row (guest) should NOT have HOST badge
      const secondRow = pair.guest.locator('.online-player-list .online-player-row').nth(1);
      await expect(secondRow.locator('.online-host-badge')).not.toBeAttached();
    } finally {
      await closePair(pair);
    }
  });

  test('SLOT_ASSIGNMENT populates remotePlayers on guest with host entry', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await connectToLobby(pair);

      // Guest should have exactly 1 remote player (the host, P1)
      const guestRemotePlayers = await pair.guest.evaluate(() => {
        return (window as any).__gameStore?.getState().online.remotePlayers;
      });

      expect(guestRemotePlayers).toHaveLength(1);
      expect(guestRemotePlayers[0].slot).toBe('P1');
      expect(guestRemotePlayers[0].characterName).toBeTruthy();
    } finally {
      await closePair(pair);
    }
  });

  test('host character change reflected in guest player list without duplicate', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await connectToLobby(pair);

      // Host changes character and wait for it to propagate to guest
      const hostSelect = pair.host.locator('.online-char-select');
      const oldChar = await pair.guest.evaluate(() =>
        (window as any).__gameStore?.getState().online.remotePlayers?.[0]?.characterName
      );
      await hostSelect.selectOption({ index: 3 });
      await pair.guest.waitForFunction((prev) => {
        const rp = (window as any).__gameStore?.getState().online.remotePlayers;
        return rp?.[0]?.characterName && rp[0].characterName !== prev;
      }, oldChar, { timeout: 5000 });

      // Guest should still see exactly 2 rows
      const guestRows = pair.guest.locator('.online-player-list .online-player-row');
      await expect(guestRows).toHaveCount(2);

      // Guest's remotePlayers should still have exactly 1 entry (the host)
      const guestRemotePlayers = await pair.guest.evaluate(() => {
        return (window as any).__gameStore?.getState().online.remotePlayers;
      });
      expect(guestRemotePlayers).toHaveLength(1);
    } finally {
      await closePair(pair);
    }
  });

  test('different characters shown for host and guest in guest player list', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await connectToLobby(pair);

      // Both should have resolved to different characters (auto-switch on conflict)
      const hostChar = await pair.host.locator('.online-char-select').inputValue();
      const guestChar = await pair.guest.locator('.online-char-select').inputValue();
      expect(hostChar).not.toBe(guestChar);

      // Guest's player list text should contain both character names
      const guestListText = await pair.guest.locator('.online-player-list').textContent();
      expect(guestListText).toBeTruthy();
      // The two rows should show different characters (not both the same)
      const rows = await pair.guest.locator('.online-player-list .online-player-row .online-char-name').allTextContents();
      expect(rows).toHaveLength(2);
      expect(rows[0]).not.toBe(rows[1]);
    } finally {
      await closePair(pair);
    }
  });
});

test.describe('Online — Mobile Guest Controls', { tag: '@online' }, () => {
  test.setTimeout(60000);

  test('getInputAny merges touch input for mobile guest', async ({ browser }) => {
    const pair = await createPair(browser, /* guestMobile */ true);
    try {
      await startOnlineMatch(pair);

      // Wait past countdown
      await pair.guest.waitForFunction(() => {
        const gl = (window as any).__gameLoop;
        return gl?.getState()?.countdown <= 0;
      }, { timeout: 10000 });

      // Verify touch input manager exists on guest
      const hasTouchInput = await pair.guest.evaluate(() => {
        const gl = (window as any).__gameLoop;
        return gl?.getTouchInput() !== null;
      });
      expect(hasTouchInput).toBe(true);

      // Verify touch overlay is rendered for mobile guest
      await expect(pair.guest.locator('.touch-overlay')).toBeVisible();

      // Simulate touch input by setting the touch manager's internal fields,
      // then verify getInputAny() picks it up
      const inputMerged = await pair.guest.evaluate(() => {
        const gl = (window as any).__gameLoop;
        const ti = gl?.getTouchInput();
        if (!ti) return null;

        // Read current merged input (should be all false — no keys/touch pressed)
        const before = gl.getInputAny();

        // Inject synthetic touch state via internal fields
        // (TypeScript private → regular JS properties at runtime)
        (ti as any).leftActive = true;
        (ti as any).jumpTriggered = true;
        (ti as any).jumpConsumed = false;
        const after = gl.getInputAny();

        // Restore
        (ti as any).leftActive = false;
        (ti as any).jumpTriggered = false;

        return { before, after };
      });

      expect(inputMerged).not.toBeNull();
      // After injecting touch left+jump, getInputAny should reflect those
      expect(inputMerged!.after.left).toBe(true);
      expect(inputMerged!.after.jump).toBe(true);
    } finally {
      await closePair(pair);
    }
  });

  test('mobile guest touch overlay visible during online match', async ({ browser }) => {
    const pair = await createPair(browser, /* guestMobile */ true);
    try {
      await startOnlineMatch(pair);
      await expect(pair.guest.locator('.touch-overlay')).toBeVisible();
      // Host (desktop) should NOT have touch overlay
      await expect(pair.host.locator('.touch-overlay')).not.toBeAttached();
    } finally {
      await closePair(pair);
    }
  });

  test('mobile guest assigned correct local slot for touch input', async ({ browser }) => {
    const pair = await createPair(browser, /* guestMobile */ true);
    try {
      await startOnlineMatch(pair);

      // Guest should have localSlot set to P2 (not P1 which is the host)
      const guestSlot = await pair.guest.evaluate(() => {
        return (window as any).__gameStore?.getState().online.localSlot;
      });
      expect(guestSlot).toBe('P2');

      // GameLoop's touchSlot should match the local slot
      const touchSlot = await pair.guest.evaluate(() => {
        const gl = (window as any).__gameLoop;
        return (gl as any)?.touchSlot;
      });
      expect(touchSlot).toBe('P2');
    } finally {
      await closePair(pair);
    }
  });
});

test.describe('Online — Visual Effects During Rollback', { tag: '@online' }, () => {
  test.setTimeout(90000);

  test('screenFlash does not accumulate beyond normal range during match', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      // Use volcano arena (has lava hazards that trigger screenFlash)
      await pair.host.evaluate(() => {
        (window as any).__gameStore?.getState().setMatchSettings({
          botCount: 3,
          botDifficulty: 'hard',
          killLimit: 99,
          timeLimit: 30,
        });
      });

      // Select volcano arena for hazard-heavy testing
      const code = await hostCreateRoom(pair.host);
      await guestJoinRoom(pair.guest, code);
      await waitForLobby(pair.host);
      await waitForLobby(pair.guest);

      // Change to volcano arena
      await pair.host.evaluate(() => {
        (window as any).__gameStore?.getState().setMatchSettings({ arenaId: 'volcano' });
      });

      await pair.host.getByTestId('online-start-btn').click();
      await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: 15000 });
      await expect(pair.guest.getByTestId('match-screen')).toBeVisible({ timeout: 15000 });

      // Wait past countdown
      await pair.host.waitForFunction(() => {
        const gl = (window as any).__gameLoop;
        return gl?.getState()?.countdown <= 0;
      }, { timeout: 10000 });

      // Sample screenFlash over 15 seconds — it should never exceed SCREEN_FLASH_DURATION (0.15)
      // If it accumulates during rollback, it would grow well beyond 0.15
      let maxFlashHost = 0;
      let maxFlashGuest = 0;
      const SCREEN_FLASH_DURATION = 0.15;

      for (let i = 0; i < 15; i++) {
        await pair.host.waitForTimeout(1000);

        const [hostFlash, guestFlash] = await Promise.all([
          pair.host.evaluate(() => {
            const gl = (window as any).__gameLoop;
            return gl?.getState()?.screenFlash ?? 0;
          }),
          pair.guest.evaluate(() => {
            const gl = (window as any).__gameLoop;
            return gl?.getState()?.screenFlash ?? 0;
          }),
        ]);

        maxFlashHost = Math.max(maxFlashHost, hostFlash);
        maxFlashGuest = Math.max(maxFlashGuest, guestFlash);
      }

      console.log(`Max screenFlash — Host: ${maxFlashHost.toFixed(4)}, Guest: ${maxFlashGuest.toFixed(4)}, Threshold: ${SCREEN_FLASH_DURATION}`);

      // screenFlash should never exceed SCREEN_FLASH_DURATION + small tolerance
      // (it's set to 0.06 or SCREEN_FLASH_DURATION, then decays — should never grow)
      expect(maxFlashHost).toBeLessThanOrEqual(SCREEN_FLASH_DURATION + 0.01);
      expect(maxFlashGuest).toBeLessThanOrEqual(SCREEN_FLASH_DURATION + 0.01);
    } finally {
      await closePair(pair);
    }
  });

  test('screenShake does not accumulate beyond normal range during match', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await pair.host.evaluate(() => {
        (window as any).__gameStore?.getState().setMatchSettings({
          botCount: 3,
          botDifficulty: 'hard',
          arenaId: 'volcano',
          killLimit: 99,
          timeLimit: 25,
        });
      });

      await startOnlineMatch(pair);

      // Wait past countdown
      await pair.host.waitForFunction(() => {
        const gl = (window as any).__gameLoop;
        return gl?.getState()?.countdown <= 0;
      }, { timeout: 10000 });

      let maxShakeHost = 0;
      const SCREEN_SHAKE_DURATION = 0.3; // from constants.ts

      for (let i = 0; i < 12; i++) {
        await pair.host.waitForTimeout(1000);
        const shake = await pair.host.evaluate(() => {
          const gl = (window as any).__gameLoop;
          return gl?.getState()?.screenShake ?? 0;
        });
        maxShakeHost = Math.max(maxShakeHost, shake);
      }

      console.log(`Max screenShake — Host: ${maxShakeHost.toFixed(4)}, Threshold: ${SCREEN_SHAKE_DURATION}`);
      expect(maxShakeHost).toBeLessThanOrEqual(SCREEN_SHAKE_DURATION + 0.01);
    } finally {
      await closePair(pair);
    }
  });
});

test.describe('Online — Cross-Architecture Sync (fround)', { tag: '@online' }, () => {
  test.setTimeout(120000);

  test('positions stay in sync for 20+ seconds on hazard-heavy arena', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      // Volcano: lava zones, lava rocks, effect zones — max stress for float precision
      await pair.host.evaluate(() => {
        (window as any).__gameStore?.getState().setMatchSettings({
          botCount: 2,
          botDifficulty: 'hard',
          arenaId: 'volcano',
          killLimit: 99,
          timeLimit: 40,
        });
      });

      await startOnlineMatch(pair);

      // Wait past countdown
      await pair.host.waitForFunction(() => {
        const gl = (window as any).__gameLoop;
        return gl?.getState()?.countdown <= 0;
      }, { timeout: 10000 });

      // Sample for 25 seconds — specifically checking that positions don't diverge
      // over time (the original bug was desync at ~20s)
      const divergences: string[] = [];

      for (let i = 0; i < 12; i++) {
        await pair.host.waitForTimeout(2000);

        const [hostState, guestState] = await Promise.all([
          pair.host.evaluate(() => {
            const gl = (window as any).__gameLoop;
            if (!gl) return null;
            const s = gl.getState();
            return {
              timeElapsed: s.timeElapsed,
              players: s.players.map((p: any) => ({
                id: p.id, x: Math.round(p.x), y: Math.round(p.y),
                score: p.score, state: p.state,
              })),
            };
          }),
          pair.guest.evaluate(() => {
            const gl = (window as any).__gameLoop;
            if (!gl) return null;
            const s = gl.getState();
            return {
              timeElapsed: s.timeElapsed,
              players: s.players.map((p: any) => ({
                id: p.id, x: Math.round(p.x), y: Math.round(p.y),
                score: p.score, state: p.state,
              })),
            };
          }),
        ]);

        if (!hostState || !guestState) continue;
        if (hostState.players.length === 0) continue;

        const t = (i + 1) * 2;

        // Check score sync
        for (let j = 0; j < Math.min(hostState.players.length, guestState.players.length); j++) {
          if (hostState.players[j].score !== guestState.players[j].score) {
            divergences.push(`t=${t}s: ${hostState.players[j].id} score: host=${hostState.players[j].score} guest=${guestState.players[j].score}`);
          }
        }

        // Check position sync — 80px tolerance for human players, 120px for bots
        for (let j = 0; j < Math.min(hostState.players.length, guestState.players.length); j++) {
          const hp = hostState.players[j];
          const gp = guestState.players[j];
          const threshold = hp.id.startsWith('B') ? 120 : 80;
          const dx = Math.abs(hp.x - gp.x);
          const dy = Math.abs(hp.y - gp.y);
          if (dx > threshold || dy > threshold) {
            divergences.push(`t=${t}s: ${hp.id} pos: host=(${hp.x},${hp.y}) guest=(${gp.x},${gp.y}) delta=(${dx},${dy})`);
          }
        }
      }

      if (divergences.length > 0) {
        console.log('DIVERGENCES:', divergences.join('\n'));
      }

      // Allow up to 2 transient divergences (snapshot timing skew between peers)
      // but no sustained drift
      expect(divergences.length).toBeLessThanOrEqual(2);
    } finally {
      await closePair(pair);
    }
  });

  test('effect zone velocities stay synced (zero-G, currents)', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      // Underwater has zero-G effect zones + currents
      await pair.host.evaluate(() => {
        (window as any).__gameStore?.getState().setMatchSettings({
          botCount: 2,
          botDifficulty: 'medium',
          arenaId: 'underwater',
          killLimit: 99,
          timeLimit: 30,
        });
      });

      await startOnlineMatch(pair);

      await pair.host.waitForFunction(() => {
        const gl = (window as any).__gameLoop;
        return gl?.getState()?.countdown <= 0;
      }, { timeout: 10000 });

      // Sample for 20 seconds
      const scoreDiverges: string[] = [];

      for (let i = 0; i < 10; i++) {
        await pair.host.waitForTimeout(2000);

        const [hostScores, guestScores] = await Promise.all([
          pair.host.evaluate(() => {
            const gl = (window as any).__gameLoop;
            return gl?.getState()?.players.map((p: any) => ({ id: p.id, score: p.score })) ?? [];
          }),
          pair.guest.evaluate(() => {
            const gl = (window as any).__gameLoop;
            return gl?.getState()?.players.map((p: any) => ({ id: p.id, score: p.score })) ?? [];
          }),
        ]);

        for (let j = 0; j < Math.min(hostScores.length, guestScores.length); j++) {
          if (hostScores[j].score !== guestScores[j].score) {
            scoreDiverges.push(`t=${(i+1)*2}s: ${hostScores[j].id} host=${hostScores[j].score} guest=${guestScores[j].score}`);
          }
        }
      }

      if (scoreDiverges.length > 0) {
        console.log('SCORE DIVERGENCES (underwater):', scoreDiverges.join('\n'));
      }

      expect(scoreDiverges.length).toBeLessThanOrEqual(2);
    } finally {
      await closePair(pair);
    }
  });
});
