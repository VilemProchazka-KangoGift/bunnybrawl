// Regression: renderer-only worker mode (`?simWorker` not set) must reach
// phase=playing on the dev server. Same Vite-dev message-drop class as the
// sim-worker boot-handshake fix — RendererProxy needed its own boot queue.

import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5173/bunnybrawl/' });

test('renderer-only worker reaches phase=playing on dev', async ({ page }) => {
  await page.goto('?arena=meadow&bots=2');
  await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(
    () => (window as unknown as { __bunnyTest?: { state?: () => { phase?: string } } })
      .__bunnyTest?.state?.()?.phase === 'playing',
    undefined,
    { timeout: 15000 },
  );
});
