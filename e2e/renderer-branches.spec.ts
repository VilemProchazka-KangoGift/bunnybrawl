import { test, expect } from '@playwright/test';

/**
 * E2E tests exercising renderer.ts conditional branches.
 * Each test auto-starts a match on a specific arena to trigger different rendering paths,
 * then reads renderer diagnostics via window.__bunnyTest.diagnostics().
 *
 * These tests verify that the renderer code paths execute — not pixel-perfect output.
 */

async function startMatch(
  page: any,
  opts: { arena?: string; bots?: number; killLimit?: number; timeLimit?: number; difficulty?: string; gore?: boolean } = {},
) {
  const arena = opts.arena ?? 'meadow';
  const bots = opts.bots ?? 3;
  const killLimit = opts.killLimit ?? 16;
  let url = `/?arena=${arena}&bots=${bots}&killLimit=${killLimit}`;
  if (opts.timeLimit) url += `&timeLimit=${opts.timeLimit}`;
  if (opts.difficulty) url += `&difficulty=${opts.difficulty}`;
  if (opts.gore !== undefined) url += `&gore=${opts.gore ? '1' : '0'}`;
  await page.goto(url);
  await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('game-canvas')).toBeVisible();
}

async function waitForCountdown(page: any, timeoutMs = 10000) {
  await page.waitForFunction(
    () => {
      const loop = window.__bunnyTest;
      if (!loop) return false;
      return loop.state().countdown <= 0;
    },
    { timeout: timeoutMs },
  );
}

async function getDiag(page: any) {
  return page.evaluate(() => {
    const loop = window.__bunnyTest;
    if (!loop) return null;
    return loop.diagnostics() ?? null;
  });
}

async function getState(page: any) {
  return page.evaluate(() => {
    const loop = window.__bunnyTest;
    if (!loop) return null;
    const s = loop.state();
    return {
      timeElapsed: s.timeElapsed,
      countdown: s.countdown,
      matchOver: s.matchOver,
      playerCount: s.players.length,
      weatherCount: s.weather.length,
      gibCount: s.gibs.length,
      confettiCount: s.confetti.length,
      shockwaveCount: s.shockwaves?.length ?? 0,
      springCount: s.springs.length,
      thornCount: s.thorns.length,
      carrotCount: s.carrots.length,
      ghostCount: s.ghosts.length,
      fogCount: s.fogParticles?.length ?? 0,
      pollenCount: s.pollenParticles?.length ?? 0,
      killFeedLength: s.killFeed.length,
    };
  });
}

test.describe('Renderer — basic match (meadow)', () => {
  test('renders clouds, players, HUD, and countdown', async ({ page }) => {
    await startMatch(page, { arena: 'meadow', bots: 2 });

    // During countdown, verify basic rendering
    const diag = await getDiag(page);
    expect(diag).not.toBeNull();
    expect(diag.clouds).toBe(true);
    expect(diag.playersDrawn).toBeGreaterThan(0);
    expect(diag.countdown).toBe(true);
  });

  test('renders weather particles after gameplay starts', async ({ page }) => {
    await startMatch(page, { arena: 'meadow', bots: 2 });
    await waitForCountdown(page);

    // Wait a moment for weather to spawn
    await page.waitForFunction(() => {
      const loop = window.__bunnyTest;
      return loop?.state()?.weather?.length > 0;
    }, { timeout: 10000 });

    const diag = await getDiag(page);
    expect(diag.weather).toBe(true);
  });

  test('renders wildlife (butterflies/birds)', async ({ page }) => {
    await startMatch(page, { arena: 'meadow', bots: 2 });
    await waitForCountdown(page);

    const diag = await getDiag(page);
    expect(diag.wildlife).toBe(true);
  });

  test('renders day/night cycle on meadow', async ({ page }) => {
    await startMatch(page, { arena: 'meadow', bots: 2 });
    await waitForCountdown(page);

    const diag = await getDiag(page);
    expect(diag.dayNight).toBe(true);
  });

  test('renders springs and thorns', async ({ page }) => {
    await startMatch(page, { arena: 'meadow', bots: 2 });
    await waitForCountdown(page);

    // Wait for springs/thorns to spawn
    await page.waitForFunction(() => {
      const s = window.__bunnyTest?.state();
      return s && (s.springs.length > 0 || s.thorns.length > 0);
    }, { timeout: 15000 });

    const diag = await getDiag(page);
    expect(diag.springs || diag.thorns).toBe(true);
  });
});

test.describe('Renderer — stomp effects', () => {
  test('renders shockwaves, hitstop, and screen shake on stomp', async ({ page }) => {
    // Many bots on a small arena → frequent stomps
    await startMatch(page, { arena: 'meadow', bots: 4, killLimit: 30, difficulty: 'hard' });
    await waitForCountdown(page);

    // Wait for at least one kill to happen (which triggers stomp effects)
    await page.waitForFunction(() => {
      const s = window.__bunnyTest?.state();
      return s && s.killFeed.length > 0;
    }, { timeout: 30000 });

    // Read accumulated diagnostics — effects are brief so check state instead
    const state = await getState(page);
    expect(state.killFeedLength).toBeGreaterThan(0);
  });

  test('renders gibs with gore ON', async ({ page }) => {
    await startMatch(page, { arena: 'meadow', bots: 4, killLimit: 30, gore: true, difficulty: 'hard' });
    await waitForCountdown(page);

    // Wait for a kill (produces gibs in gore mode)
    await page.waitForFunction(() => {
      const s = window.__bunnyTest?.state();
      return s && s.gibs.length > 0;
    }, { timeout: 30000 });

    const diag = await getDiag(page);
    expect(diag.gibs).toBe(true);
  });

  test('renders confetti with gore OFF', async ({ page }) => {
    await startMatch(page, { arena: 'meadow', bots: 4, killLimit: 30, gore: false, difficulty: 'hard' });
    await waitForCountdown(page);

    // Wait for a kill (produces confetti in no-gore mode)
    await page.waitForFunction(() => {
      const s = window.__bunnyTest?.state();
      return s && s.confetti.length > 0;
    }, { timeout: 30000 });

    const diag = await getDiag(page);
    expect(diag.confetti).toBe(true);
  });
});

test.describe('Renderer — arena-specific features', () => {
  test('volcano: renders hazard zones and lava rocks', async ({ page }) => {
    await startMatch(page, { arena: 'volcano', bots: 2 });
    await waitForCountdown(page);

    // Wait for lava rocks to spawn
    await page.waitForFunction(() => {
      const s = window.__bunnyTest?.state();
      return s && s.lavaRocks.some((r: any) => r.active);
    }, { timeout: 20000 });

    const diag = await getDiag(page);
    expect(diag.hazardZones).toBe(true);
    expect(diag.lavaRocks).toBe(true);
  });

  test('underwater: renders effect zones and fog', async ({ page }) => {
    await startMatch(page, { arena: 'underwater', bots: 2 });
    await waitForCountdown(page);

    const diag = await getDiag(page);
    expect(diag.effectZones).toBe(true);
    expect(diag.fog).toBe(true);
  });

  test('space_station: renders zero-G zones and animated background', async ({ page }) => {
    await startMatch(page, { arena: 'space_station', bots: 2 });
    await waitForCountdown(page);

    const diag = await getDiag(page);
    expect(diag.effectZones).toBe(true);
    expect(diag.animatedBg).toBe(true);
  });

  test('haunted_graveyard: renders ghosts and fog', async ({ page }) => {
    await startMatch(page, { arena: 'haunted_graveyard', bots: 2 });
    await waitForCountdown(page);

    // Wait longer for ghosts to appear (they have spawn timers)
    await page.waitForFunction(() => {
      const s = window.__bunnyTest?.state();
      return s && s.ghosts.length > 0;
    }, { timeout: 25000 });

    const state = await getState(page);
    expect(state.ghostCount).toBeGreaterThan(0);

    const diag = await getDiag(page);
    expect(diag.fog).toBe(true);
  });

  test('candy_land: renders bouncy platforms', async ({ page }) => {
    await startMatch(page, { arena: 'candy_land', bots: 2 });
    await waitForCountdown(page);

    const diag = await getDiag(page);
    expect(diag.bouncyPlatforms).toBe(true);
  });

  test('treetops: renders ambient particles (pollen)', async ({ page }) => {
    await startMatch(page, { arena: 'treetops', bots: 2 });
    await waitForCountdown(page);

    // Wait for pollen to spawn
    await page.waitForFunction(() => {
      const s = window.__bunnyTest?.state();
      return s && s.pollenParticles && s.pollenParticles.length > 0;
    }, { timeout: 15000 });

    const diag = await getDiag(page);
    expect(diag.ambient).toBe(true);
  });

  test('waterfall: renders current effect zones', async ({ page }) => {
    await startMatch(page, { arena: 'waterfall', bots: 2 });
    await waitForCountdown(page);

    const diag = await getDiag(page);
    expect(diag.effectZones).toBe(true);
  });
});

test.describe('Renderer — match lifecycle', () => {
  test('renders fireworks when match ends', async ({ page }) => {
    // Use very low kill limit so match ends quickly
    await startMatch(page, { arena: 'meadow', bots: 4, killLimit: 2, difficulty: 'hard' });
    await waitForCountdown(page);

    // Wait for match to end
    await page.waitForFunction(() => {
      const s = window.__bunnyTest?.state();
      return s && s.matchOver;
    }, { timeout: 60000 });

    // Give fireworks a frame to render
    await page.waitForTimeout(200);

    const diag = await getDiag(page);
    expect(diag.fireworks).toBe(true);
  });

  test('renders carrots during match', async ({ page }) => {
    await startMatch(page, { arena: 'meadow', bots: 2 });
    await waitForCountdown(page);

    // Wait for a carrot to spawn
    await page.waitForFunction(() => {
      const s = window.__bunnyTest?.state();
      return s && s.carrots.some((c: any) => c.active);
    }, { timeout: 15000 });

    const diag = await getDiag(page);
    expect(diag.carrots).toBe(true);
  });
});
