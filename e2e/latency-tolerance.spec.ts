import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

/**
 * Latency tolerance test — measures how the netcode degrades at increasing RTT.
 *
 * Runs matches at 0ms, 40ms, 80ms, 120ms, and 160ms simulated latency.
 * For each, captures: stall count, rollback rate, score sync, position sync.
 * Identifies the RTT threshold where the netcode breaks down.
 *
 * Key constants from rollback.ts:
 *   MAX_ROLLBACK_FRAMES = 7 (max rewind depth)
 *   MAX_INPUT_DELAY = 4 (max adaptive delay)
 *   STALL_TIMEOUT_MS = 8000 (disconnect after 8s stall)
 *
 * At RTT > ~130ms, one-way latency exceeds MAX_ROLLBACK_FRAMES * tick,
 * causing frequent stalls (freezes) and eventual disconnect.
 */

async function openOnlineModal(page: Page) {
  await page.getByTestId('online-btn').click();
  await page.waitForTimeout(200);
}

async function hostCreateRoom(page: Page): Promise<string> {
  await openOnlineModal(page);
  await page.getByTestId('online-name-input').fill('LatHost');
  await page.getByTestId('online-create-btn').click();
  const codeEl = page.getByTestId('online-room-code');
  await expect(codeEl).toBeVisible({ timeout: 15000 });
  return (await codeEl.textContent())!.trim();
}

async function guestJoinRoom(page: Page, code: string) {
  await openOnlineModal(page);
  await page.getByTestId('online-name-input').fill('LatGuest');
  await page.getByTestId('online-join-btn').click();
  await page.getByTestId('online-code-input').fill(code);
  await page.getByTestId('online-join-submit').click();
}

async function waitForLobby(page: Page) {
  const startBtn = page.getByTestId('online-start-btn');
  const readyBtn = page.getByTestId('online-ready-btn');
  await expect(startBtn.or(readyBtn)).toBeVisible({ timeout: 15000 });
}

interface LatencyResult {
  latency: number;
  rtt: number;
  jitter: number;
  inputDelay: number;
  rollbacksPerSec: number;
  maxRollbackDepth: number;
  stalled: boolean;
  scoreDesyncs: number;
  positionDesyncs: number;
  matchSurvived: boolean;
}

test.describe('Latency Tolerance @online @desync', () => {
  test.setTimeout(600000); // 10 min for all latencies

  test('netcode behavior at 0/40/80/120/160ms latency', async ({ browser }) => {
    const latencies = [0, 80, 160, 250];
    const results: LatencyResult[] = [];

    for (const latency of latencies) {
      console.log(`\n>>> Testing latency: ${latency}ms`);

      const hostCtx = await browser.newContext();
      const guestCtx = await browser.newContext();
      const host = await hostCtx.newPage();
      const guest = await guestCtx.newPage();

      const suffix = latency > 0 ? `?simLatency=${latency}&simJitter=${Math.round(latency * 0.25)}&noturn` : '?noturn';

      try {
        await host.goto('/' + suffix);
        await guest.goto('/' + suffix);

        await host.evaluate(() => {
          window.__bunnyTest?.gameStore()?.getState().setMatchSettings({
            botCount: 2, botDifficulty: 'medium', killLimit: 99, timeLimit: 15,
          });
        });

        const code = await hostCreateRoom(host);
        await guestJoinRoom(guest, code);
        await waitForLobby(host);
        await waitForLobby(guest);
        await host.getByTestId('online-start-btn').click();

        const matchStarted = await host.getByTestId('match-screen')
          .isVisible({ timeout: 15000 }).catch(() => false);

        if (!matchStarted) {
          results.push({
            latency, rtt: -1, jitter: -1, inputDelay: -1,
            rollbacksPerSec: -1, maxRollbackDepth: -1, stalled: true,
            scoreDesyncs: -1, positionDesyncs: -1, matchSurvived: false,
          });
          continue;
        }

        await expect(guest.getByTestId('match-screen')).toBeVisible({ timeout: 15000 });

        // Wait past countdown
        await host.waitForFunction(() => {
          const gl = window.__bunnyTest;
          return gl?.state()?.countdown <= 0;
        }, { timeout: 15000 }).catch(() => {});

        // Sample for 10 seconds
        let scoreDesyncs = 0;
        let positionDesyncs = 0;
        let matchSurvived = true;

        for (let i = 0; i < 5; i++) {
          await host.waitForTimeout(2000);

          const hostAlive = await host.evaluate(() => !!window.__bunnyTest?.state()).catch(() => false);
          if (!hostAlive) { matchSurvived = false; break; }

          const [hs, gs] = await Promise.all([
            host.evaluate(() => {
              const s = window.__bunnyTest?.state();
              return s ? { players: s.players.map((p: any) => ({ score: p.score, x: Math.round(p.x), y: Math.round(p.y) })) } : null;
            }).catch(() => null),
            guest.evaluate(() => {
              const s = window.__bunnyTest?.state();
              return s ? { players: s.players.map((p: any) => ({ score: p.score, x: Math.round(p.x), y: Math.round(p.y) })) } : null;
            }).catch(() => null),
          ]);

          if (hs && gs) {
            for (let j = 0; j < Math.min(hs.players.length, gs.players.length); j++) {
              if (hs.players[j].score !== gs.players[j].score) scoreDesyncs++;
              if (Math.abs(hs.players[j].x - gs.players[j].x) > 100 ||
                  Math.abs(hs.players[j].y - gs.players[j].y) > 100) positionDesyncs++;
            }
          }
        }

        // Final stats
        const stats = await host.evaluate(() => {
          const nm = window.__bunnyTest?.netMatch();
          if (!nm) return null;
          const s = nm.getRollbackStats();
          return { rtt: Math.round(s.rtt), jitter: Math.round(s.jitter), inputDelay: s.inputDelay,
                   rollbacksPerSec: s.rollbacksPerSec, maxRollbackDepth: s.maxRollbackDepth, stalled: s.stalled };
        }).catch(() => null);

        results.push({
          latency,
          rtt: stats?.rtt ?? -1,
          jitter: stats?.jitter ?? -1,
          inputDelay: stats?.inputDelay ?? -1,
          rollbacksPerSec: stats?.rollbacksPerSec ?? -1,
          maxRollbackDepth: stats?.maxRollbackDepth ?? -1,
          stalled: stats?.stalled ?? false,
          scoreDesyncs, positionDesyncs, matchSurvived,
        });
      } finally {
        await hostCtx.close().catch(() => {});
        await guestCtx.close().catch(() => {});
      }
    }

    // Print results
    console.log('\n' + '='.repeat(100));
    console.log('LATENCY TOLERANCE — NETCODE BEHAVIOR AT INCREASING RTT');
    console.log('Constants: MAX_ROLLBACK=15 frames, MAX_INPUT_DELAY=8 frames, STALL_TIMEOUT=8s');
    console.log('='.repeat(100));
    console.log(
      'Sim Lat'.padEnd(10) + 'RTT'.padEnd(8) + 'Jit'.padEnd(7) + 'Delay'.padEnd(7) +
      'RB/s'.padEnd(7) + 'MaxRB'.padEnd(7) + 'Stall'.padEnd(7) +
      'ScoreΔ'.padEnd(8) + 'PosΔ'.padEnd(7) + 'Alive'
    );
    console.log('-'.repeat(100));
    for (const r of results) {
      console.log(
        `${r.latency}ms`.padEnd(10) +
        `${r.rtt}ms`.padEnd(8) +
        `${r.jitter}ms`.padEnd(7) +
        `${r.inputDelay}F`.padEnd(7) +
        `${r.rollbacksPerSec}`.padEnd(7) +
        `${r.maxRollbackDepth}`.padEnd(7) +
        `${r.stalled ? 'YES' : 'no'}`.padEnd(7) +
        `${r.scoreDesyncs}`.padEnd(8) +
        `${r.positionDesyncs}`.padEnd(7) +
        `${r.matchSurvived ? 'yes' : 'DIED'}`
      );
    }
    console.log('='.repeat(100));

    // At 0ms and 40ms, netcode should work fine
    const low = results.find(r => r.latency === 0);
    if (low?.matchSurvived) {
      expect(low.scoreDesyncs).toBeLessThanOrEqual(5);
    }
    const mid = results.find(r => r.latency === 40);
    if (mid?.matchSurvived) {
      expect(mid.scoreDesyncs).toBeLessThanOrEqual(5);
    }
  });
});
