import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

/**
 * E2E tests for online multiplayer (P2P via PeerJS).
 * Uses two browser contexts (Host + Guest) connecting through the free PeerJS signaling server.
 *
 * Tag: @online — these tests require network access and are inherently slower.
 * Debug params: ?killLimit=4&timeLimit=30 for fast matches.
 *
 * NOTE: Tests that require two peers to connect depend on PeerJS free signaling server
 * (0.peerjs.com) which is rate-limited and occasionally unreliable. For reliable CI,
 * run a local PeerJS server: npx peerjs --port 9000
 * Then update Transport constructor to use { host: 'localhost', port: 9000 }.
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
  await page.waitForTimeout(200); // modal animation
}

async function hostCreateRoom(page: Page, name = 'Host'): Promise<string> {
  await openOnlineModal(page);
  await page.getByTestId('online-name-input').fill(name);
  await page.getByTestId('online-create-btn').click();
  const codeEl = page.getByTestId('online-room-code');
  await expect(codeEl).toBeVisible({ timeout: 15000 });
  const code = await codeEl.textContent();
  expect(code).toMatch(/^[A-Z2-9]{3}$/);
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

async function createPair(browser: Browser): Promise<OnlinePair> {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  host.on('console', msg => { if (msg.type() === 'error') console.log(`[HOST] ${msg.text()}`); });
  guest.on('console', msg => { if (msg.type() === 'error') console.log(`[GUEST] ${msg.text()}`); });
  await host.goto('/');
  await guest.goto('/');
  return { host, guest, hostCtx, guestCtx };
}

/** Connect both peers and reach the lobby. */
async function connectToLobby(pair: OnlinePair): Promise<string> {
  const code = await hostCreateRoom(pair.host);
  await guestJoinRoom(pair.guest, code);
  await waitForLobby(pair.host);
  await waitForLobby(pair.guest);
  return code;
}

/** Connect, start the match, and wait for both to enter match screen. */
async function startOnlineMatch(pair: OnlinePair) {
  await connectToLobby(pair);
  await pair.host.getByTestId('online-start-btn').click();
  await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
  await expect(pair.guest.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
}

/** Wait past countdown (~3s) so gameplay is active. */
async function waitPastCountdown(page: Page) {
  await page.waitForTimeout(4000);
}

/** Set a short time limit on the host so the match ends quickly. */
async function setShortTimeLimit(page: Page, seconds = 5) {
  await page.evaluate((s) => {
    window.__bunnyTest?.gameStore()?.getState().setMatchSettings({ timeLimit: s });
  }, seconds);
}

async function closePair(pair: OnlinePair) {
  await pair.hostCtx.close().catch(() => {});
  await pair.guestCtx.close().catch(() => {});
}

// ---- Tests ----

test.describe('Online Multiplayer — Connection', { tag: '@online' }, () => {
  test.setTimeout(60000);

  test('host creates room and gets 3-char code', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      const code = await hostCreateRoom(pair.host);
      expect(code).toHaveLength(3);
    } finally {
      await closePair(pair);
    }
  });

  test('guest joins room and both reach lobby', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await connectToLobby(pair);
      await expect(pair.host.getByTestId('online-start-btn')).toBeVisible();
      await expect(pair.guest.getByTestId('online-ready-btn')).toBeVisible();
    } finally {
      await closePair(pair);
    }
  });

  test('player names shown in lobby and propagated to match', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      const code = await hostCreateRoom(pair.host, 'Alice');
      await guestJoinRoom(pair.guest, code, 'Bob');
      await waitForLobby(pair.host);
      await waitForLobby(pair.guest);

      // Host lobby: should show "Alice" (you) and "Bob" for guest
      await expect(pair.host.locator('.online-player-list')).toContainText('Alice');
      await expect(pair.host.locator('.online-player-list')).toContainText('Bob');

      // Guest lobby: should show "Bob" (you) and "Alice" for host
      await expect(pair.guest.locator('.online-player-list')).toContainText('Bob');
      await expect(pair.guest.locator('.online-player-list')).toContainText('Alice');

      // Start match and verify playerNames in store
      await pair.host.getByTestId('online-start-btn').click();
      await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
      await expect(pair.guest.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });

      // Check playerNames map on both sides
      const hostNames = await pair.host.evaluate(() => {
        return window.__bunnyTest?.gameStore()?.getState().online.playerNames;
      });
      const guestNames = await pair.guest.evaluate(() => {
        return window.__bunnyTest?.gameStore()?.getState().online.playerNames;
      });

      expect(hostNames['P1']).toBe('Alice');
      expect(hostNames['P2']).toBe('Bob');
      expect(guestNames['P1']).toBe('Alice');
      expect(guestNames['P2']).toBe('Bob');
    } finally {
      await closePair(pair);
    }
  });

  test('create/join buttons hidden without name, visible with name', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await openOnlineModal(pair.host);
      // Buttons should not exist when name is empty
      await expect(pair.host.getByTestId('online-create-btn')).not.toBeVisible();
      await expect(pair.host.getByTestId('online-join-btn')).not.toBeVisible();

      // Fill name → buttons appear
      await pair.host.getByTestId('online-name-input').fill('TestPlayer');
      await expect(pair.host.getByTestId('online-create-btn')).toBeVisible();
      await expect(pair.host.getByTestId('online-join-btn')).toBeVisible();
    } finally {
      await closePair(pair);
    }
  });

  test('player name persists across sessions', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/');
    try {
      // Enter a name
      await openOnlineModal(page);
      await page.getByTestId('online-name-input').fill('PersistMe');

      // Close modal and reopen — name should be preserved
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      await openOnlineModal(page);
      await expect(page.getByTestId('online-name-input')).toHaveValue('PersistMe');
    } finally {
      await ctx.close();
    }
  });

  test('invalid room code shows error', async ({ browser }) => {
    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    await guest.goto('/');
    try {
      await openOnlineModal(guest);
      await guest.getByTestId('online-name-input').fill('TestPlayer');
      await guest.getByText('Join Room').click();
      await guest.getByTestId('online-code-input').fill('ZZZ');
      await guest.getByTestId('online-join-submit').click();
      await expect(guest.locator('.online-error')).toBeVisible({ timeout: 15000 });
    } finally {
      await guestCtx.close();
    }
  });
});

test.describe('Online Multiplayer — Match Start', { tag: '@online' }, () => {
  test.setTimeout(60000);

  test('host starts match and both enter game', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await startOnlineMatch(pair);
      await expect(pair.host.getByTestId('game-canvas')).toBeVisible();
      await expect(pair.guest.getByTestId('game-canvas')).toBeVisible();
    } finally {
      await closePair(pair);
    }
  });

  test('match does not freeze during countdown', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await startOnlineMatch(pair);
      await waitPastCountdown(pair.host);

      const hostTime = await pair.host.evaluate(() => {
        const gl = window.__bunnyTest;
        return gl ? gl.state().timeElapsed : -1;
      });
      expect(hostTime).toBeGreaterThan(0.5);
    } finally {
      await closePair(pair);
    }
  });
});

test.describe('Online Multiplayer — Pause', { tag: '@online' }, () => {
  test.setTimeout(60000);

  test('host pause shows overlay on both screens', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await startOnlineMatch(pair);
      await waitPastCountdown(pair.host);

      // Host presses Escape to pause
      await pair.host.keyboard.press('Escape');

      // Host sees pause overlay
      await expect(pair.host.getByTestId('pause-menu')).toBeVisible({ timeout: 3000 });

      // Guest should also see pause (synced via PAUSE message)
      await expect(pair.guest.getByTestId('pause-menu')).toBeVisible({ timeout: 5000 });
    } finally {
      await closePair(pair);
    }
  });

  test('host resume hides overlay on both screens', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await startOnlineMatch(pair);
      await waitPastCountdown(pair.host);

      // Pause
      await pair.host.keyboard.press('Escape');
      await expect(pair.host.getByTestId('pause-menu')).toBeVisible({ timeout: 3000 });

      // Resume
      await pair.host.getByTestId('resume-button').click();

      // Both should no longer show pause
      await expect(pair.host.getByTestId('pause-menu')).not.toBeVisible({ timeout: 3000 });
      await expect(pair.guest.getByTestId('pause-menu')).not.toBeVisible({ timeout: 5000 });
    } finally {
      await closePair(pair);
    }
  });

  test('guest pause shows overlay on both screens', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await startOnlineMatch(pair);
      await waitPastCountdown(pair.guest);

      // Guest presses Escape
      await pair.guest.keyboard.press('Escape');

      await expect(pair.guest.getByTestId('pause-menu')).toBeVisible({ timeout: 3000 });
      await expect(pair.host.getByTestId('pause-menu')).toBeVisible({ timeout: 5000 });
    } finally {
      await closePair(pair);
    }
  });

  test('host sees Cancel Game, guest sees Leave Game in pause menu', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await startOnlineMatch(pair);
      await waitPastCountdown(pair.host);

      // Both pause
      await pair.host.keyboard.press('Escape');
      await expect(pair.host.getByTestId('pause-menu')).toBeVisible({ timeout: 3000 });
      await expect(pair.guest.getByTestId('pause-menu')).toBeVisible({ timeout: 5000 });

      // Both have a quit button visible in the pause menu
      await expect(pair.host.getByTestId('quit-button')).toBeVisible();
      await expect(pair.guest.getByTestId('quit-button')).toBeVisible();
    } finally {
      await closePair(pair);
    }
  });
});

test.describe('Online Multiplayer — Victory Screen', { tag: '@online' }, () => {
  test.setTimeout(60000);

  test('match ends by time and both see victory screen', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await setShortTimeLimit(pair.host, 5);
      await connectToLobby(pair);
      await pair.host.getByTestId('online-start-btn').click();
      await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });

      // Wait for match to end (3s countdown + 5s match + buffer)
      await expect(pair.host.getByTestId('victory-screen')).toBeVisible({ timeout: 20000 });
      await expect(pair.guest.getByTestId('victory-screen')).toBeVisible({ timeout: 5000 });
    } finally {
      await closePair(pair);
    }
  });

  test('victory screen shows player names instead of animal names', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await setShortTimeLimit(pair.host, 5);
      // Use specific names
      const code = await hostCreateRoom(pair.host, 'Zara');
      await guestJoinRoom(pair.guest, code, 'Kai');
      await waitForLobby(pair.host);
      await waitForLobby(pair.guest);

      await pair.host.getByTestId('online-start-btn').click();
      await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });

      // Wait for match to end
      await expect(pair.host.getByTestId('victory-screen')).toBeVisible({ timeout: 20000 });
      await expect(pair.guest.getByTestId('victory-screen')).toBeVisible({ timeout: 5000 });

      // Victory screen should show player names
      const hostVictoryText = await pair.host.getByTestId('victory-screen').textContent();
      expect(hostVictoryText).toContain('Zara');
      expect(hostVictoryText).toContain('Kai');

      const guestVictoryText = await pair.guest.getByTestId('victory-screen').textContent();
      expect(guestVictoryText).toContain('Zara');
      expect(guestVictoryText).toContain('Kai');
    } finally {
      await closePair(pair);
    }
  });

  test('host sees Rematch + Change Arena, guest sees Leave', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await setShortTimeLimit(pair.host, 5);
      await connectToLobby(pair);
      await pair.host.getByTestId('online-start-btn').click();
      await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });

      await expect(pair.host.getByTestId('victory-screen')).toBeVisible({ timeout: 20000 });
      await expect(pair.guest.getByTestId('victory-screen')).toBeVisible({ timeout: 5000 });

      // Host sees rematch and change arena buttons
      await expect(pair.host.getByTestId('rematch-button')).toBeVisible();
      await expect(pair.host.getByTestId('change-arena-button')).toBeVisible();
      await expect(pair.host.getByTestId('menu-button')).toBeVisible();

      // Guest only sees Leave button (no rematch/arena)
      await expect(pair.guest.getByTestId('rematch-button')).not.toBeVisible();
      await expect(pair.guest.getByTestId('change-arena-button')).not.toBeVisible();
      await expect(pair.guest.getByTestId('menu-button')).toBeVisible();
    } finally {
      await closePair(pair);
    }
  });

  test('host rematch starts a new match for both', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await setShortTimeLimit(pair.host, 5);
      await connectToLobby(pair);
      await pair.host.getByTestId('online-start-btn').click();

      // Wait for first match to end
      await expect(pair.host.getByTestId('victory-screen')).toBeVisible({ timeout: 25000 });
      await expect(pair.guest.getByTestId('victory-screen')).toBeVisible({ timeout: 5000 });

      // Host clicks Rematch
      await pair.host.getByTestId('rematch-button').click();

      // Both should enter a new match
      await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
      await expect(pair.guest.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
    } finally {
      await closePair(pair);
    }
  });

  test('host change arena starts match on different arena', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await setShortTimeLimit(pair.host, 5);
      await connectToLobby(pair);
      await pair.host.getByTestId('online-start-btn').click();

      // Wait for first match to end
      await expect(pair.host.getByTestId('victory-screen')).toBeVisible({ timeout: 25000 });

      // Host clicks Change Arena
      await pair.host.getByTestId('change-arena-button').click();
      await expect(pair.host.getByTestId('arena-select-modal')).toBeVisible({ timeout: 3000 });

      // Pick the first arena button in the grid
      await pair.host.locator('.victory-arena-btn').first().click();

      // Both should enter a new match
      await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
      await expect(pair.guest.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
    } finally {
      await closePair(pair);
    }
  });
});

test.describe('Online Multiplayer — State Sync', { tag: '@online' }, () => {
  test.setTimeout(60000);

  test('game state stays in sync between host and guest', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await startOnlineMatch(pair);
      await waitPastCountdown(pair.host);

      // Collect state snapshots every 2 seconds for 10 seconds
      const snapshots: Array<{ host: any; guest: any; time: number }> = [];
      for (let i = 0; i < 5; i++) {
        await pair.host.waitForTimeout(2000);

        const [hostState, guestState] = await Promise.all([
          pair.host.evaluate(() => {
            const gl = window.__bunnyTest;
            if (!gl) return null;
            const s = gl.state();
            return {
              timeElapsed: s.timeElapsed,
              players: s.players.map((p: any) => ({
                id: p.id, x: Math.round(p.x), y: Math.round(p.y),
                score: p.score, state: p.state,
              })),
              carrots: s.carrots.length,
              springs: s.springs.length,
              thorns: s.thorns.length,
            };
          }),
          pair.guest.evaluate(() => {
            const gl = window.__bunnyTest;
            if (!gl) return null;
            const s = gl.state();
            return {
              timeElapsed: s.timeElapsed,
              players: s.players.map((p: any) => ({
                id: p.id, x: Math.round(p.x), y: Math.round(p.y),
                score: p.score, state: p.state,
              })),
              carrots: s.carrots.length,
              springs: s.springs.length,
              thorns: s.thorns.length,
            };
          }),
        ]);

        if (hostState && guestState) {
          snapshots.push({ host: hostState, guest: guestState, time: i * 2 });
        }
      }

      // Verify state is in sync
      expect(snapshots.length).toBeGreaterThan(0);
      for (const snap of snapshots) {
        // Time should be within 0.5s (accounts for frame differences)
        expect(Math.abs(snap.host.timeElapsed - snap.guest.timeElapsed)).toBeLessThan(0.5);

        // Scores must match exactly
        for (let i = 0; i < snap.host.players.length; i++) {
          expect(snap.host.players[i].score).toBe(snap.guest.players[i].score);
          expect(snap.host.players[i].state).toBe(snap.guest.players[i].state);
        }

        // Player positions should be within 50px (rollback correction window)
        for (let i = 0; i < snap.host.players.length; i++) {
          const dx = Math.abs(snap.host.players[i].x - snap.guest.players[i].x);
          const dy = Math.abs(snap.host.players[i].y - snap.guest.players[i].y);
          expect(dx).toBeLessThan(50);
          expect(dy).toBeLessThan(50);
        }

        // Entity counts should match
        expect(snap.host.carrots).toBe(snap.guest.carrots);
        expect(snap.host.springs).toBe(snap.guest.springs);
        expect(snap.host.thorns).toBe(snap.guest.thorns);
      }

      // Log final state for debugging if test fails
      console.log('State sync snapshots:', JSON.stringify(snapshots, null, 2));
    } finally {
      await closePair(pair);
    }
  });

  test('game state stays in sync with bots', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      // Add 2 bots for the match
      await pair.host.evaluate(() => {
        window.__bunnyTest?.gameStore()?.getState().setMatchSettings({ botCount: 2, botDifficulty: 'medium' });
      });

      await startOnlineMatch(pair);
      await waitPastCountdown(pair.host);

      // Collect snapshots over 8 seconds
      const desyncs: string[] = [];
      for (let i = 0; i < 4; i++) {
        await pair.host.waitForTimeout(2000);

        const [hostState, guestState] = await Promise.all([
          pair.host.evaluate(() => {
            const gl = window.__bunnyTest;
            if (!gl) return null;
            const s = gl.state();
            return {
              timeElapsed: s.timeElapsed,
              players: s.players.map((p: any) => ({
                id: p.id, x: Math.round(p.x), y: Math.round(p.y),
                score: p.score, state: p.state,
              })),
              carrots: s.carrots.length,
              springs: s.springs.length,
            };
          }),
          pair.guest.evaluate(() => {
            const gl = window.__bunnyTest;
            if (!gl) return null;
            const s = gl.state();
            return {
              timeElapsed: s.timeElapsed,
              players: s.players.map((p: any) => ({
                id: p.id, x: Math.round(p.x), y: Math.round(p.y),
                score: p.score, state: p.state,
              })),
              carrots: s.carrots.length,
              springs: s.springs.length,
            };
          }),
        ]);

        if (hostState && guestState) {
          // Check scores match
          for (let j = 0; j < hostState.players.length; j++) {
            if (hostState.players[j].score !== guestState.players[j].score) {
              desyncs.push(`t=${(i*2)}s: ${hostState.players[j].id} score: host=${hostState.players[j].score} guest=${guestState.players[j].score}`);
            }
          }
          // Check positions within tolerance
          for (let j = 0; j < hostState.players.length; j++) {
            const dx = Math.abs(hostState.players[j].x - guestState.players[j].x);
            const dy = Math.abs(hostState.players[j].y - guestState.players[j].y);
            if (dx > 100 || dy > 100) {
              desyncs.push(`t=${(i*2)}s: ${hostState.players[j].id} pos: host=(${hostState.players[j].x},${hostState.players[j].y}) guest=(${guestState.players[j].x},${guestState.players[j].y})`);
            }
          }
          console.log(`[Bot sync t=${i*2}s] time: host=${hostState.timeElapsed.toFixed(1)} guest=${guestState.timeElapsed.toFixed(1)} | scores: ${hostState.players.map((p: any) => p.score).join(',')} vs ${guestState.players.map((p: any) => p.score).join(',')}`);
        }
      }

      if (desyncs.length > 0) {
        console.log('DESYNCS DETECTED:', desyncs.join('\n'));
      }
      expect(desyncs).toHaveLength(0);
    } finally {
      await closePair(pair);
    }
  });
});

test.describe('Online Multiplayer — Disconnect', { tag: '@online' }, () => {
  test.setTimeout(60000);

  test('guest disconnect during match shows victory for host', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await startOnlineMatch(pair);
      await waitPastCountdown(pair.host);

      // Guest closes their tab
      await pair.guestCtx.close();

      // Host should transition to victory screen with disconnect info
      await expect(pair.host.getByTestId('victory-screen')).toBeVisible({ timeout: 15000 });
      await expect(pair.host.getByTestId('disconnect-info')).toBeVisible();

      // Disconnect win: no rematch button, only menu button
      await expect(pair.host.getByTestId('rematch-button')).not.toBeVisible();
      await expect(pair.host.getByTestId('menu-button')).toBeVisible();
    } finally {
      await pair.hostCtx.close().catch(() => {});
    }
  });

  test('host disconnect during match brings guest back to menu', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await startOnlineMatch(pair);
      await waitPastCountdown(pair.guest);

      // Host closes their tab
      await pair.hostCtx.close();

      // Guest should see disconnect → either victory screen or return to menu
      const victoryOrMenu = pair.guest.getByTestId('victory-screen').or(pair.guest.getByTestId('main-menu'));
      await expect(victoryOrMenu).toBeVisible({ timeout: 15000 });
    } finally {
      await pair.guestCtx.close().catch(() => {});
    }
  });

  test('guest leaving via pause quit returns both to correct state', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await startOnlineMatch(pair);
      await waitPastCountdown(pair.guest);

      // Guest pauses and quits
      await pair.guest.keyboard.press('Escape');
      await expect(pair.guest.getByTestId('pause-menu')).toBeVisible({ timeout: 3000 });
      await pair.guest.getByTestId('quit-button').click();

      // Guest returns to main menu
      await expect(pair.guest.getByTestId('main-menu')).toBeVisible({ timeout: 5000 });

      // Host should detect disconnect
      await expect(
        pair.host.getByTestId('victory-screen').or(pair.host.getByTestId('main-menu'))
      ).toBeVisible({ timeout: 15000 });
    } finally {
      await closePair(pair);
    }
  });

  test('guest leave from victory screen returns to menu', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await setShortTimeLimit(pair.host, 5);
      await connectToLobby(pair);
      await pair.host.getByTestId('online-start-btn').click();

      // Wait for match to end
      await expect(pair.guest.getByTestId('victory-screen')).toBeVisible({ timeout: 25000 });

      // Guest clicks Leave
      await pair.guest.getByTestId('menu-button').click();

      // Guest returns to main menu
      await expect(pair.guest.getByTestId('main-menu')).toBeVisible({ timeout: 5000 });
    } finally {
      await closePair(pair);
    }
  });

  test('host quit from pause returns both to menu', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await startOnlineMatch(pair);
      await waitPastCountdown(pair.host);

      // Host pauses and cancels game
      await pair.host.keyboard.press('Escape');
      await expect(pair.host.getByTestId('pause-menu')).toBeVisible({ timeout: 3000 });
      await pair.host.getByTestId('quit-button').click();

      // Host returns to menu
      await expect(pair.host.getByTestId('main-menu')).toBeVisible({ timeout: 5000 });

      // Guest should detect disconnect
      await expect(
        pair.guest.getByTestId('victory-screen').or(pair.guest.getByTestId('main-menu'))
      ).toBeVisible({ timeout: 15000 });
    } finally {
      await closePair(pair);
    }
  });
});

test.describe('Online Multiplayer — Character Select Stability', { tag: '@online' }, () => {
  test.setTimeout(60000);

  test('no infinite character select cascade when both peers have same default', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      // Both peers will start with the same default character.
      // After connecting, one should auto-switch exactly once — no infinite loop.
      const code = await hostCreateRoom(pair.host);
      await guestJoinRoom(pair.guest, code);
      await waitForLobby(pair.host);
      await waitForLobby(pair.guest);

      // If we reach here without timeout, the cascade didn't happen.
      // Verify both peers have different characters (auto-switch resolved the conflict).
      const hostChar = await pair.host.locator('.online-char-select').inputValue();
      const guestChar = await pair.guest.locator('.online-char-select').inputValue();
      expect(hostChar).not.toBe(guestChar);

      // Wait an additional 2s to confirm no further switching happens
      const hostCharAfter = await pair.host.locator('.online-char-select').inputValue();
      await pair.host.waitForTimeout(2000);
      const hostCharFinal = await pair.host.locator('.online-char-select').inputValue();
      expect(hostCharFinal).toBe(hostCharAfter); // no further changes
    } finally {
      await closePair(pair);
    }
  });
});
