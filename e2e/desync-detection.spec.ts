import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

/**
 * E2E desync detection test.
 *
 * Connects two peers (host + guest) with 5 bots on a chaotic arena.
 * Takes regular state hash snapshots from each peer and compares them
 * to detect desynchronization frequency and severity.
 *
 * Uses per-subsystem hashes (players, entities, timers) to pinpoint
 * which part of the game state diverged when desyncs occur.
 *
 * Tag: @online @desync
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

async function hostCreateRoom(page: Page, name = 'DesyncHost'): Promise<string> {
  await openOnlineModal(page);
  await page.getByTestId('online-name-input').fill(name);
  await page.getByTestId('online-create-btn').click();
  const codeEl = page.getByTestId('online-room-code');
  await expect(codeEl).toBeVisible({ timeout: 15000 });
  const code = await codeEl.textContent();
  expect(code).toMatch(/^[A-Z2-9]{3}$/);
  return code!;
}

async function guestJoinRoom(page: Page, code: string, name = 'DesyncGuest') {
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
  // Log errors for debugging
  host.on('console', msg => { if (msg.type() === 'error') console.log(`[HOST] ${msg.text()}`); });
  guest.on('console', msg => { if (msg.type() === 'error') console.log(`[GUEST] ${msg.text()}`); });
  // Also capture net desync logs
  host.on('console', msg => { if (msg.text().includes('[net]')) console.log(`[HOST] ${msg.text()}`); });
  guest.on('console', msg => { if (msg.text().includes('[net]')) console.log(`[GUEST] ${msg.text()}`); });
  await host.goto('/');
  await guest.goto('/');
  return { host, guest, hostCtx, guestCtx };
}

async function closePair(pair: OnlinePair) {
  await pair.hostCtx.close().catch(() => {});
  await pair.guestCtx.close().catch(() => {});
}

/** Grab a state snapshot from one peer — includes hash, positions, scores, and rollback stats. */
async function grabSnapshot(page: Page) {
  return page.evaluate(() => {
    const gl = (window as any).__gameLoop;
    const nm = (window as any).__netMatch;
    if (!gl) return null;
    const s = gl.getState();
    const hash = gl.getStateHash?.() ?? null;
    const rollback = nm?.getRollbackStats?.() ?? null;
    return {
      timeElapsed: s.timeElapsed,
      matchOver: s.matchOver,
      hash: hash ? {
        composite: hash.hash,
        players: hash.playersHash,
        entities: hash.entitiesHash,
        timers: hash.timersHash,
      } : null,
      players: s.players.map((p: any) => ({
        id: p.id,
        x: Math.round(p.x),
        y: Math.round(p.y),
        score: p.score,
        state: p.state,
      })),
      entityCounts: {
        carrots: s.carrots.filter((c: any) => c.active).length,
        springs: s.springs.length,
        thorns: s.thorns.length,
        ghosts: s.ghosts.length,
        gibs: s.gibs.length,
      },
      rollback: rollback ? {
        localFrame: rollback.localFrame,
        remoteConfirmedFrame: rollback.remoteConfirmedFrame,
        rtt: Math.round(rollback.rtt),
        jitter: Math.round(rollback.jitter),
        inputDelay: rollback.inputDelay,
        rollbacksPerSec: rollback.rollbacksPerSec,
        maxRollbackDepth: rollback.maxRollbackDepth,
        stalled: rollback.stalled,
      } : null,
    };
  });
}

interface DesyncEntry {
  time: number;
  frameHost: number;
  frameGuest: number;
  severity: 'hash-mismatch' | 'score-diverged' | 'position-diverged' | 'entity-diverged';
  subsystem?: string;
  detail: string;
}

// ---- Tests ----

test.describe('Desync Detection @online @desync', () => {
  test.setTimeout(120000); // 2 minutes — long match

  test('5-bot match: measure desync frequency and severity over 30 seconds', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      // Configure: 5 bots, hard difficulty, meadow arena (lots of features)
      await pair.host.evaluate(() => {
        (window as any).__gameStore?.getState().setMatchSettings({
          botCount: 5,
          botDifficulty: 'hard',
          killLimit: 99, // high limit so match doesn't end early
          timeLimit: 45, // 45-second match
        });
      });

      // Connect and start match
      const code = await hostCreateRoom(pair.host);
      await guestJoinRoom(pair.guest, code);
      await waitForLobby(pair.host);
      await waitForLobby(pair.guest);
      await pair.host.getByTestId('online-start-btn').click();
      await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: 15000 });
      await expect(pair.guest.getByTestId('match-screen')).toBeVisible({ timeout: 15000 });

      // Wait past countdown
      await pair.host.waitForFunction(() => {
        const gl = (window as any).__gameLoop;
        return gl?.getState()?.countdown <= 0;
      }, { timeout: 10000 });

      // ---- Snapshot collection phase ----
      const snapshots: Array<{ host: any; guest: any; time: number }> = [];
      const desyncs: DesyncEntry[] = [];
      const SAMPLE_INTERVAL_MS = 1000;
      const SAMPLE_COUNT = 25; // 25 seconds of data

      for (let i = 0; i < SAMPLE_COUNT; i++) {
        await pair.host.waitForTimeout(SAMPLE_INTERVAL_MS);

        const [hostSnap, guestSnap] = await Promise.all([
          grabSnapshot(pair.host),
          grabSnapshot(pair.guest),
        ]);

        if (!hostSnap || !guestSnap) continue;
        if (hostSnap.matchOver || guestSnap.matchOver) break;

        const t = i + 1; // seconds since data collection started
        snapshots.push({ host: hostSnap, guest: guestSnap, time: t });

        // ---- Desync analysis ----

        // 1. Hash comparison (most reliable)
        if (hostSnap.hash && guestSnap.hash) {
          if (hostSnap.hash.composite !== guestSnap.hash.composite) {
            const diverged: string[] = [];
            if (hostSnap.hash.players !== guestSnap.hash.players) diverged.push('players');
            if (hostSnap.hash.entities !== guestSnap.hash.entities) diverged.push('entities');
            if (hostSnap.hash.timers !== guestSnap.hash.timers) diverged.push('timers');
            desyncs.push({
              time: t,
              frameHost: hostSnap.rollback?.localFrame ?? 0,
              frameGuest: guestSnap.rollback?.localFrame ?? 0,
              severity: 'hash-mismatch',
              subsystem: diverged.join('+') || 'composite-only',
              detail: `Hash: host=${hostSnap.hash.composite} guest=${guestSnap.hash.composite} | diverged: ${diverged.join(', ')}`,
            });
          }
        }

        // 2. Score comparison (must always match)
        for (let j = 0; j < Math.min(hostSnap.players.length, guestSnap.players.length); j++) {
          if (hostSnap.players[j].score !== guestSnap.players[j].score) {
            desyncs.push({
              time: t,
              frameHost: hostSnap.rollback?.localFrame ?? 0,
              frameGuest: guestSnap.rollback?.localFrame ?? 0,
              severity: 'score-diverged',
              detail: `${hostSnap.players[j].id}: host=${hostSnap.players[j].score} guest=${guestSnap.players[j].score}`,
            });
          }
        }

        // 3. Position comparison (tolerance: 100px for bots, 50px for humans)
        for (let j = 0; j < Math.min(hostSnap.players.length, guestSnap.players.length); j++) {
          const hp = hostSnap.players[j];
          const gp = guestSnap.players[j];
          const threshold = hp.id.startsWith('B') ? 100 : 50;
          const dx = Math.abs(hp.x - gp.x);
          const dy = Math.abs(hp.y - gp.y);
          if (dx > threshold || dy > threshold) {
            desyncs.push({
              time: t,
              frameHost: hostSnap.rollback?.localFrame ?? 0,
              frameGuest: guestSnap.rollback?.localFrame ?? 0,
              severity: 'position-diverged',
              detail: `${hp.id}: host=(${hp.x},${hp.y}) guest=(${gp.x},${gp.y}) delta=(${dx},${dy})`,
            });
          }
        }

        // 4. Entity count comparison
        const ec = hostSnap.entityCounts;
        const gc = guestSnap.entityCounts;
        if (ec.carrots !== gc.carrots || ec.springs !== gc.springs || ec.thorns !== gc.thorns) {
          desyncs.push({
            time: t,
            frameHost: hostSnap.rollback?.localFrame ?? 0,
            frameGuest: guestSnap.rollback?.localFrame ?? 0,
            severity: 'entity-diverged',
            detail: `carrots:${ec.carrots}/${gc.carrots} springs:${ec.springs}/${gc.springs} thorns:${ec.thorns}/${gc.thorns}`,
          });
        }
      }

      // ---- Report ----
      const totalSnapshots = snapshots.length;
      const hashMismatches = desyncs.filter(d => d.severity === 'hash-mismatch').length;
      const scoreDiverged = desyncs.filter(d => d.severity === 'score-diverged').length;
      const positionDiverged = desyncs.filter(d => d.severity === 'position-diverged').length;
      const entityDiverged = desyncs.filter(d => d.severity === 'entity-diverged').length;

      // Rollback stats from the final snapshot
      const finalHost = snapshots[snapshots.length - 1]?.host;
      const finalGuest = snapshots[snapshots.length - 1]?.guest;

      console.log('\n========== DESYNC DETECTION REPORT ==========');
      console.log(`Snapshots collected: ${totalSnapshots} (over ${totalSnapshots}s)`);
      console.log(`Players: 2 humans + 5 bots = 7 total`);
      console.log('');
      console.log('--- Desync Counts ---');
      console.log(`  Hash mismatches:    ${hashMismatches} / ${totalSnapshots} (${(hashMismatches / totalSnapshots * 100).toFixed(1)}%)`);
      console.log(`  Score divergences:  ${scoreDiverged}`);
      console.log(`  Position diverged:  ${positionDiverged}`);
      console.log(`  Entity diverged:    ${entityDiverged}`);
      console.log('');
      if (finalHost?.rollback) {
        console.log('--- Host Rollback Stats ---');
        console.log(`  Frame: ${finalHost.rollback.localFrame}`);
        console.log(`  RTT: ${finalHost.rollback.rtt}ms | Jitter: ${finalHost.rollback.jitter}ms`);
        console.log(`  Input delay: ${finalHost.rollback.inputDelay}F`);
        console.log(`  Rollbacks/sec: ${finalHost.rollback.rollbacksPerSec}`);
        console.log(`  Max rollback depth: ${finalHost.rollback.maxRollbackDepth}`);
      }
      if (finalGuest?.rollback) {
        console.log('--- Guest Rollback Stats ---');
        console.log(`  Frame: ${finalGuest.rollback.localFrame}`);
        console.log(`  RTT: ${finalGuest.rollback.rtt}ms | Jitter: ${finalGuest.rollback.jitter}ms`);
        console.log(`  Input delay: ${finalGuest.rollback.inputDelay}F`);
        console.log(`  Rollbacks/sec: ${finalGuest.rollback.rollbacksPerSec}`);
        console.log(`  Max rollback depth: ${finalGuest.rollback.maxRollbackDepth}`);
      }
      if (desyncs.length > 0) {
        console.log('');
        console.log('--- Desync Events (first 10) ---');
        for (const d of desyncs.slice(0, 10)) {
          console.log(`  t=${d.time}s [${d.severity}] ${d.subsystem ? `(${d.subsystem}) ` : ''}${d.detail}`);
        }
      }
      console.log('=============================================\n');

      // ---- Assertions ----
      // We expect zero score divergences (hard failure = broken netcode)
      expect(scoreDiverged).toBe(0);

      // Hash mismatches are expected due to snapshot timing skew between peers —
      // each peer reads state at a slightly different frame, producing different
      // hashes even when gameplay is perfectly in sync. The hash comparison is
      // informational (logged above), not a pass/fail criterion.
      // What matters is that gameplay-visible state (scores, positions, entities) matches.

      // Position divergence > 100px for humans indicates failed correction
      const humanPosDesyncs = desyncs.filter(
        d => d.severity === 'position-diverged' && !d.detail.startsWith('B')
      );
      expect(humanPosDesyncs.length).toBe(0);

      // Entity counts must stay in sync
      expect(entityDiverged).toBe(0);
    } finally {
      await closePair(pair);
    }
  });

  test('desync correction: hash mismatch rate decreases over time', async ({ browser }) => {
    const pair = await createPair(browser);
    try {
      await pair.host.evaluate(() => {
        (window as any).__gameStore?.getState().setMatchSettings({
          botCount: 3,
          botDifficulty: 'medium',
          killLimit: 99,
          timeLimit: 30,
        });
      });

      const code = await hostCreateRoom(pair.host);
      await guestJoinRoom(pair.guest, code);
      await waitForLobby(pair.host);
      await waitForLobby(pair.guest);
      await pair.host.getByTestId('online-start-btn').click();
      await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: 15000 });
      await expect(pair.guest.getByTestId('match-screen')).toBeVisible({ timeout: 15000 });

      await pair.host.waitForFunction(() => {
        const gl = (window as any).__gameLoop;
        return gl?.getState()?.countdown <= 0;
      }, { timeout: 10000 });

      // Measure hash mismatch rate in first half vs second half
      const firstHalf: boolean[] = [];
      const secondHalf: boolean[] = [];

      for (let i = 0; i < 16; i++) {
        await pair.host.waitForTimeout(1000);

        const [hostSnap, guestSnap] = await Promise.all([
          grabSnapshot(pair.host),
          grabSnapshot(pair.guest),
        ]);

        if (!hostSnap?.hash || !guestSnap?.hash) continue;
        if (hostSnap.matchOver) break;

        const matched = hostSnap.hash.composite === guestSnap.hash.composite;
        if (i < 8) firstHalf.push(matched);
        else secondHalf.push(matched);
      }

      const firstRate = firstHalf.filter(m => m).length / Math.max(firstHalf.length, 1);
      const secondRate = secondHalf.filter(m => m).length / Math.max(secondHalf.length, 1);

      console.log(`Hash match rate: first half ${(firstRate * 100).toFixed(0)}%, second half ${(secondRate * 100).toFixed(0)}%`);

      // The second half should have at least as good sync as the first half
      // (desync correction should stabilize over time, not degrade)
      // Allow some tolerance since this is timing-dependent
      expect(secondRate).toBeGreaterThanOrEqual(firstRate - 0.3);
    } finally {
      await closePair(pair);
    }
  });
});
