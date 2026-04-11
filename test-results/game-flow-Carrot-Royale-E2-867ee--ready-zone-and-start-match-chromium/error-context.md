# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: game-flow.spec.ts >> Carrot Royale E2E >> players can reach ready zone and start match
- Location: e2e\game-flow.spec.ts:35:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('match-screen')
Expected: visible
Timeout: 40000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 40000ms
  - waiting for getByTestId('match-screen')

```

# Page snapshot

```yaml
- button "⤢" [ref=e7] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Carrot Royale E2E', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |   });
  7  | 
  8  |   test('shows main menu on load', async ({ page }) => {
  9  |     await expect(page.getByTestId('main-menu')).toBeVisible();
  10 |     await expect(page.getByAltText('Carrot Royale')).toBeVisible();
  11 |     await expect(page.getByTestId('play-button')).toBeVisible();
  12 |   });
  13 | 
  14 |   test('navigates from menu to lobby', async ({ page }) => {
  15 |     await page.getByTestId('play-button').click();
  16 |     await expect(page.getByTestId('char-select')).toBeVisible();
  17 |     await expect(page.getByTestId('lobby-canvas')).toBeVisible();
  18 |   });
  19 | 
  20 |   test('lobby canvas has correct dimensions', async ({ page }) => {
  21 |     await page.getByTestId('play-button').click();
  22 |     const canvas = page.getByTestId('lobby-canvas');
  23 |     await expect(canvas).toHaveAttribute('width', '1280');
  24 |     await expect(canvas).toHaveAttribute('height', '720');
  25 |   });
  26 | 
  27 |   test('escape key returns to menu from lobby', async ({ page }) => {
  28 |     await page.getByTestId('play-button').click();
  29 |     await expect(page.getByTestId('char-select')).toBeVisible();
  30 | 
  31 |     await page.keyboard.press('Escape');
  32 |     await expect(page.getByTestId('main-menu')).toBeVisible();
  33 |   });
  34 | 
  35 |   test('players can reach ready zone and start match', { tag: '@flaky' }, async ({ page }) => {
  36 |     test.setTimeout(50000);
  37 |     await page.getByTestId('play-button').click();
  38 |     await expect(page.getByTestId('lobby-canvas')).toBeVisible();
  39 | 
  40 |     // Hold right + spam jump to get over the wall and NPCs
  41 |     await page.keyboard.down('d');
  42 |     await page.keyboard.down('ArrowRight');
  43 | 
  44 |     // Aggressively jump + fast-fall to push through NPCs and over wall
  45 |     const jumpLoop = async () => {
  46 |       for (let i = 0; i < 60; i++) {
  47 |         await page.keyboard.press('w');
  48 |         await page.keyboard.press('ArrowUp');
  49 |         // Alternate: fast-fall to stomp NPCs, then jump again
  50 |         if (i % 3 === 1) {
  51 |           await page.keyboard.press('s');
  52 |           await page.keyboard.press('ArrowDown');
  53 |         }
  54 |         await page.waitForTimeout(200);
  55 |       }
  56 |     };
  57 |     jumpLoop();
  58 | 
> 59 |     await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 40000 });
     |                                                    ^ Error: expect(locator).toBeVisible() failed
  60 |     await expect(page.getByTestId('game-canvas')).toBeVisible();
  61 |   });
  62 | 
  63 |   test('gore toggle exists on menu', async ({ page }) => {
  64 |     await expect(page.getByTestId('gore-toggle')).toBeVisible();
  65 |   });
  66 | });
  67 | 
```