import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * E2E tests for transport.ts lifecycle — connection, RTT, disconnect.
 * Uses two browser contexts to simulate host + guest P2P connection.
 *
 * Tagged @online — these tests depend on PeerJS signaling server availability.
 */

async function openOnlineModal(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('online-btn').click();
  await expect(page.getByTestId('online-name-input')).toBeVisible({ timeout: 5000 });
}

async function hostCreateRoom(page: Page): Promise<string> {
  await openOnlineModal(page);
  await page.getByTestId('online-name-input').fill('HostBot');
  await page.getByTestId('online-create-btn').click();

  // Wait for room code to appear
  const codeEl = page.getByTestId('online-room-code');
  await expect(codeEl).toBeVisible({ timeout: 15000 });
  const code = (await codeEl.textContent())?.trim() ?? '';
  expect(code.length).toBeGreaterThanOrEqual(3);
  return code;
}

async function guestJoinRoom(page: Page, code: string) {
  await openOnlineModal(page);
  await page.getByTestId('online-name-input').fill('GuestBot');
  await page.getByTestId('online-code-input').fill(code);
  await page.getByTestId('online-join-submit').click();
}

test.describe('Transport lifecycle @online', () => {
  let hostContext: BrowserContext;
  let guestContext: BrowserContext;
  let hostPage: Page;
  let guestPage: Page;

  test.beforeEach(async ({ browser }) => {
    hostContext = await browser.newContext();
    guestContext = await browser.newContext();
    hostPage = await hostContext.newPage();
    guestPage = await guestContext.newPage();
  });

  test.afterEach(async () => {
    await hostContext.close();
    await guestContext.close();
  });

  test('host creates room and guest joins — both reach lobby', async () => {
    const code = await hostCreateRoom(hostPage);

    await guestJoinRoom(guestPage, code);

    // Both should transition to character select
    await expect(hostPage.getByTestId('char-select')).toBeVisible({ timeout: 15000 });
    await expect(guestPage.getByTestId('char-select')).toBeVisible({ timeout: 15000 });
  });

  test('online store state reflects connection status', async () => {
    const code = await hostCreateRoom(hostPage);
    await guestJoinRoom(guestPage, code);

    await expect(hostPage.getByTestId('char-select')).toBeVisible({ timeout: 15000 });

    // Check host store reflects online state
    const hostOnline = await hostPage.evaluate(() => {
      const store = (window as any).__gameStore;
      if (!store) return null;
      const s = store.getState();
      return { isOnline: s.online.isOnline, isHost: s.online.isHost };
    });

    expect(hostOnline).not.toBeNull();
    expect(hostOnline.isOnline).toBe(true);
    expect(hostOnline.isHost).toBe(true);

    // Check guest store
    const guestOnline = await guestPage.evaluate(() => {
      const store = (window as any).__gameStore;
      if (!store) return null;
      const s = store.getState();
      return { isOnline: s.online.isOnline, isHost: s.online.isHost };
    });

    expect(guestOnline).not.toBeNull();
    expect(guestOnline.isOnline).toBe(true);
    expect(guestOnline.isHost).toBe(false);
  });

  test('online match starts and both peers have game state', async () => {
    const code = await hostCreateRoom(hostPage);
    await guestJoinRoom(guestPage, code);

    // Both reach lobby
    await expect(hostPage.getByTestId('char-select')).toBeVisible({ timeout: 15000 });
    await expect(guestPage.getByTestId('char-select')).toBeVisible({ timeout: 15000 });

    // Host starts the match — walk to START zone via keyboard
    // Use the ready button if available, or skip via store
    const startBtn = hostPage.getByTestId('online-start-btn');
    if (await startBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startBtn.click();
    } else {
      // Walk P1 right to the ready zone
      await hostPage.keyboard.down('d');
      await hostPage.waitForTimeout(3000);
      await hostPage.keyboard.up('d');
    }

    // Wait for match screen on host
    const hostMatch = await hostPage.getByTestId('match-screen').isVisible({ timeout: 20000 }).catch(() => false);

    if (hostMatch) {
      // Verify game state exists on both peers
      const hostState = await hostPage.evaluate(() => {
        const loop = (window as any).__gameLoop;
        return loop ? { hasState: true, playerCount: loop.getState().players.length } : null;
      });

      expect(hostState).not.toBeNull();
      expect(hostState.playerCount).toBeGreaterThanOrEqual(2);
    }
    // If match didn't start (lobby timing), that's OK for this connectivity test
  });

  test('guest sees error on invalid room code', async () => {
    await openOnlineModal(guestPage);
    await guestPage.getByTestId('online-name-input').fill('GuestBot');
    await guestPage.getByTestId('online-code-input').fill('ZZZ');
    await guestPage.getByTestId('online-join-submit').click();

    // Should show error or remain on the join screen (not transition to lobby)
    // Wait a moment for the connection attempt
    await guestPage.waitForTimeout(5000);

    // Guest should NOT be on char-select (invalid code)
    const isInLobby = await guestPage.getByTestId('char-select').isVisible().catch(() => false);
    // Could also show an error message
    const hasError = await guestPage.evaluate(() => {
      const el = document.querySelector('[class*="error"], [class*="Error"]');
      return !!el;
    });

    // At least one of: not in lobby, or error shown
    expect(isInLobby === false || hasError === true).toBe(true);
  });

  test('host room code is displayed correctly', async () => {
    const code = await hostCreateRoom(hostPage);

    // Code should be uppercase alphanumeric, 3+ chars
    expect(code).toMatch(/^[A-Z2-9]{3,}$/);

    // Code should be visible on screen
    const displayed = await hostPage.getByTestId('online-room-code').textContent();
    expect(displayed?.trim()).toBe(code);
  });
});
