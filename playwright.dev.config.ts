import { defineConfig, devices } from '@playwright/test';

/** Dev-mode Playwright config — runs against `npm run dev` (port 5173)
 *  so React StrictMode actually fires its dev-only double-mount of every
 *  effect. The default `playwright.config.ts` runs against `vite preview`
 *  (production build, StrictMode = no-op), which is why round 8's
 *  "verified" claim for the deferred-teardown fix was null.
 *
 *  Used by: `e2e/worker-strictmode-cold.spec.ts` (manually, via
 *  `npx playwright test --config=playwright.dev.config.ts`). */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/worker-strictmode-cold.spec.ts', '**/sab-demo.spec.ts'],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173/bunnybrawl/',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173/bunnybrawl/',
    reuseExistingServer: !process.env.CI,
    // Dev server boot is slower than preview; bump timeout
    timeout: 60_000,
  },
});
