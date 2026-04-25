import { defineConfig, devices } from '@playwright/test';

/** Playwright config for the perf-profile spec only.
 *  Does NOT include testIgnore so the spec can be targeted directly.
 *  Used by: `npm run perf` (via scripts/runPerfProfile.mjs) */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/perf-profile.spec.ts'],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4175/bunnybrawl/',
    trace: 'off',
    // Uncap rendering — without these, headless Chrome rate-limits to vsync (~60Hz)
    // and frame-time stats become uniformly 16.7ms regardless of actual engine cost.
    launchOptions: {
      args: [
        '--disable-frame-rate-limit',
        '--disable-gpu-vsync',
        '--disable-features=CalculateNativeWinOcclusion',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
