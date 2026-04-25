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
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
