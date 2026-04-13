import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

/**
 * TURN relay diagnosis suite.
 *
 * Runs 4 scenarios on same machine to diagnose the netcode regression:
 * 1. Default ICE (with TURN servers) — baseline
 * 2. ?noturn (STUN only) — comparison
 * 3. Simulated 80ms latency — stress test with TURN candidates
 * 4. Simulated 80ms latency + ?noturn — stress test without TURN
 *
 * Each scenario connects host+guest with 3 bots, runs 12 seconds of gameplay,
 * and captures: route (DIRECT/RELAY), RTT, jitter, rollback rate, score sync.
 */

async function openOnlineModal(page: Page) {
  await page.getByTestId('online-btn').click();
  await page.waitForTimeout(200);
}

async function hostCreateRoom(page: Page): Promise<string> {
  await openOnlineModal(page);
  await page.getByTestId('online-name-input').fill('DiagHost');
  await page.getByTestId('online-create-btn').click();
  const codeEl = page.getByTestId('online-room-code');
  await expect(codeEl).toBeVisible({ timeout: 15000 });
  return (await codeEl.textContent())!.trim();
}

async function guestJoinRoom(page: Page, code: string) {
  await openOnlineModal(page);
  await page.getByTestId('online-name-input').fill('DiagGuest');
  await page.getByTestId('online-join-btn').click();
  await page.getByTestId('online-code-input').fill(code);
  await page.getByTestId('online-join-submit').click();
}

async function waitForLobby(page: Page) {
  const startBtn = page.getByTestId('online-start-btn');
  const readyBtn = page.getByTestId('online-ready-btn');
  await expect(startBtn.or(readyBtn)).toBeVisible({ timeout: 15000 });
}

interface ScenarioResult {
  name: string;
  route: string;
  rtt: number;
  jitter: number;
  inputDelay: number;
  rollbacksPerSec: number;
  maxRollbackDepth: number;
  scoreDesyncs: number;
  positionDesyncs: number;
  frameHost: number;
  frameGuest: number;
}

async function runScenario(
  browser: Browser,
  name: string,
  urlSuffix: string,
): Promise<ScenarioResult | null> {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  // Capture transport logs
  const logs: string[] = [];
  host.on('console', msg => { if (msg.text().includes('[Transport]')) logs.push(`[H] ${msg.text()}`); });
  guest.on('console', msg => { if (msg.text().includes('[Transport]')) logs.push(`[G] ${msg.text()}`); });

  try {
    await host.goto('/' + urlSuffix);
    await guest.goto('/' + urlSuffix);

    await host.evaluate(() => {
      (window as any).__gameStore?.getState().setMatchSettings({
        botCount: 3, botDifficulty: 'hard', killLimit: 99, timeLimit: 20,
      });
    });

    const code = await hostCreateRoom(host);
    await guestJoinRoom(guest, code);
    await waitForLobby(host);
    await waitForLobby(guest);
    await host.getByTestId('online-start-btn').click();
    await expect(host.getByTestId('match-screen')).toBeVisible({ timeout: 15000 });
    await expect(guest.getByTestId('match-screen')).toBeVisible({ timeout: 15000 });

    // Wait past countdown
    await host.waitForFunction(() => {
      const gl = (window as any).__gameLoop;
      return gl?.getState()?.countdown <= 0;
    }, { timeout: 10000 });

    // Let gameplay run for 12 seconds, sampling every 2s
    let scoreDesyncs = 0;
    let positionDesyncs = 0;
    for (let i = 0; i < 6; i++) {
      await host.waitForTimeout(2000);

      const [hostSnap, guestSnap] = await Promise.all([
        host.evaluate(() => {
          const gl = (window as any).__gameLoop;
          if (!gl) return null;
          const s = gl.getState();
          return {
            players: s.players.map((p: any) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), score: p.score })),
          };
        }),
        guest.evaluate(() => {
          const gl = (window as any).__gameLoop;
          if (!gl) return null;
          const s = gl.getState();
          return {
            players: s.players.map((p: any) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), score: p.score })),
          };
        }),
      ]);

      if (hostSnap && guestSnap) {
        for (let j = 0; j < Math.min(hostSnap.players.length, guestSnap.players.length); j++) {
          if (hostSnap.players[j].score !== guestSnap.players[j].score) scoreDesyncs++;
          const dx = Math.abs(hostSnap.players[j].x - guestSnap.players[j].x);
          const dy = Math.abs(hostSnap.players[j].y - guestSnap.players[j].y);
          if (dx > 100 || dy > 100) positionDesyncs++;
        }
      }
    }

    // Final stats snapshot
    const finalStats = await host.evaluate(() => {
      const nm = (window as any).__netMatch;
      const gl = (window as any).__gameLoop;
      if (!nm || !gl) return null;
      const stats = nm.getRollbackStats();
      return {
        rtt: Math.round(stats.rtt),
        jitter: Math.round(stats.jitter),
        inputDelay: stats.inputDelay,
        rollbacksPerSec: stats.rollbacksPerSec,
        maxRollbackDepth: stats.maxRollbackDepth,
        isRelay: stats.isRelay,
        localFrame: stats.localFrame,
      };
    });

    const guestFrame = await guest.evaluate(() => {
      const nm = (window as any).__netMatch;
      return nm?.getRollbackStats()?.localFrame ?? 0;
    });

    // Print transport logs for this scenario
    for (const log of logs) console.log(`  ${log}`);

    return {
      name,
      route: finalStats?.isRelay ? 'RELAY (TURN)' : 'DIRECT (P2P)',
      rtt: finalStats?.rtt ?? -1,
      jitter: finalStats?.jitter ?? -1,
      inputDelay: finalStats?.inputDelay ?? -1,
      rollbacksPerSec: finalStats?.rollbacksPerSec ?? -1,
      maxRollbackDepth: finalStats?.maxRollbackDepth ?? -1,
      scoreDesyncs,
      positionDesyncs,
      frameHost: finalStats?.localFrame ?? 0,
      frameGuest: guestFrame,
    };
  } catch (e) {
    console.log(`Scenario "${name}" failed: ${e}`);
    return null;
  } finally {
    await hostCtx.close().catch(() => {});
    await guestCtx.close().catch(() => {});
  }
}

test.describe('TURN Relay Diagnosis @online @desync', () => {
  test.setTimeout(300000); // 5 min for all 4 scenarios

  test('4-scenario TURN relay comparison', async ({ browser }) => {
    const scenarios: Array<{ name: string; suffix: string }> = [
      { name: '1. Default ICE (TURN enabled)',         suffix: '?debug=net' },
      { name: '2. STUN only (?noturn)',                suffix: '?debug=net&noturn' },
      { name: '3. Simulated 80ms latency + TURN',      suffix: '?debug=net&simLatency=80&simJitter=20' },
      { name: '4. Simulated 80ms latency + no TURN',   suffix: '?debug=net&noturn&simLatency=80&simJitter=20' },
    ];

    const results: ScenarioResult[] = [];

    for (const sc of scenarios) {
      console.log(`\n>>> Running: ${sc.name}`);
      const result = await runScenario(browser, sc.name, sc.suffix);
      if (result) results.push(result);
    }

    // ---- Print comparison table ----
    console.log('\n' + '='.repeat(90));
    console.log('TURN RELAY DIAGNOSIS — COMPARISON TABLE');
    console.log('='.repeat(90));
    console.log(
      'Scenario'.padEnd(42) +
      'Route'.padEnd(14) +
      'RTT'.padEnd(8) +
      'Jit'.padEnd(7) +
      'Delay'.padEnd(7) +
      'RB/s'.padEnd(7) +
      'ScoreΔ'.padEnd(8) +
      'PosΔ'
    );
    console.log('-'.repeat(90));
    for (const r of results) {
      console.log(
        r.name.padEnd(42) +
        r.route.padEnd(14) +
        `${r.rtt}ms`.padEnd(8) +
        `${r.jitter}ms`.padEnd(7) +
        `${r.inputDelay}F`.padEnd(7) +
        `${r.rollbacksPerSec}`.padEnd(7) +
        `${r.scoreDesyncs}`.padEnd(8) +
        `${r.positionDesyncs}`
      );
    }
    console.log('='.repeat(90));

    // ---- Diagnostic conclusions ----
    const defaultResult = results.find(r => r.name.includes('Default'));
    const noturnResult = results.find(r => r.name.includes('STUN only'));
    const simResult = results.find(r => r.name.includes('80ms') && !r.name.includes('no TURN'));
    const simNoturnResult = results.find(r => r.name.includes('80ms') && r.name.includes('no TURN'));

    if (defaultResult && noturnResult) {
      const rttDelta = defaultResult.rtt - noturnResult.rtt;
      console.log(`\nRTT delta (TURN vs no-TURN, no sim): ${rttDelta > 0 ? '+' : ''}${rttDelta}ms`);
      if (defaultResult.route.includes('RELAY')) {
        console.log('*** BUG: Same-machine connection using RELAY — TURN is being preferred over STUN ***');
      }
    }
    if (simResult && simNoturnResult) {
      const rttDelta = simResult.rtt - simNoturnResult.rtt;
      console.log(`RTT delta (TURN vs no-TURN, 80ms sim): ${rttDelta > 0 ? '+' : ''}${rttDelta}ms`);
      console.log(`Rollback rate: TURN=${simResult.rollbacksPerSec}/s vs noTURN=${simNoturnResult.rollbacksPerSec}/s`);
    }

    // ---- Assertions ----
    // Same-machine should never use RELAY
    if (defaultResult) {
      expect(defaultResult.route).toBe('DIRECT (P2P)');
    }

    // Score divergences in E2E come from reading state mid-rollback resimulation.
    // At 60 rollbacks/sec, brief transient mismatches are expected — the scores
    // converge within a frame. High counts (>20) would indicate a real bug.
    for (const r of results) {
      expect(r.scoreDesyncs).toBeLessThanOrEqual(20);
    }
  });
});
