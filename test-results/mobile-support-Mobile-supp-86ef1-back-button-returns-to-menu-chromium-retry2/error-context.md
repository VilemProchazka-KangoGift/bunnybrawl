# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-support.spec.ts >> Mobile support (@mobile) >> lobby back button returns to menu
- Location: e2e\mobile-support.spec.ts:58:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('.lobby-back-btn')
    - locator resolved to <button class="mobile-overlay-btn lobby-back-btn">‹</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button title="Celá obrazovka" class="overlay-icon-btn fullscreen-btn">⤢</button> intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button title="Celá obrazovka" class="overlay-icon-btn fullscreen-btn">⤢</button> intercepts pointer events
    - retrying click action
      - waiting 100ms
    38 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <button title="Celá obrazovka" class="overlay-icon-btn fullscreen-btn">⤢</button> intercepts pointer events
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - button "‹" [ref=e7] [cursor=pointer]
  - button "⤢" [ref=e8] [cursor=pointer]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('Mobile support (@mobile)', () => {
  4   |   test.beforeEach(async ({ page }) => {
  5   |     // ?mobile forces isTouchPrimary() = true even on desktop browsers
  6   |     await page.goto('/?mobile');
  7   |   });
  8   | 
  9   |   test('adds .is-mobile class to html element', async ({ page }) => {
  10  |     await expect(page.locator('html.is-mobile')).toBeAttached();
  11  |   });
  12  | 
  13  |   test('shows fullscreen button on mobile', async ({ page }) => {
  14  |     await expect(page.locator('.fullscreen-btn')).toBeVisible();
  15  |   });
  16  | 
  17  |   test('hides keyboard controls hint on menu', async ({ page }) => {
  18  |     await expect(page.getByTestId('main-menu')).toBeVisible();
  19  |     await expect(page.locator('.controls-hint')).toBeHidden();
  20  |   });
  21  | 
  22  |   test('enforces minimum 1 bot on mobile', async ({ page }) => {
  23  |     await expect(page.getByTestId('main-menu')).toBeVisible();
  24  |     const botCount = page.getByTestId('bot-count');
  25  |     await expect(botCount).toHaveText(/[1-5]/);
  26  |     // Minus button should be disabled at 1
  27  |     const minusBtn = page.locator('.bot-btn').first();
  28  |     // Click minus until it stops
  29  |     for (let i = 0; i < 6; i++) {
  30  |       if (await minusBtn.isDisabled()) break;
  31  |       await minusBtn.click();
  32  |     }
  33  |     await expect(botCount).toHaveText('1');
  34  |     await expect(minusBtn).toBeDisabled();
  35  |   });
  36  | 
  37  |   test('lobby loads without crash on mobile', async ({ page }) => {
  38  |     // Set 2 bots for a quicker match
  39  |     const plusBtn = page.locator('.bot-btn').last();
  40  |     await plusBtn.click();
  41  |     await plusBtn.click();
  42  | 
  43  |     await page.getByTestId('play-button').click();
  44  |     await expect(page.getByTestId('char-select')).toBeVisible();
  45  |     await expect(page.getByTestId('lobby-canvas')).toBeVisible();
  46  | 
  47  |     // Canvas should be rendering (not crashed) — wait a moment then check it's still visible
  48  |     await page.waitForTimeout(500);
  49  |     await expect(page.getByTestId('lobby-canvas')).toBeVisible();
  50  |   });
  51  | 
  52  |   test('lobby shows back button on mobile', async ({ page }) => {
  53  |     await page.getByTestId('play-button').click();
  54  |     await expect(page.getByTestId('char-select')).toBeVisible();
  55  |     await expect(page.locator('.lobby-back-btn')).toBeVisible();
  56  |   });
  57  | 
  58  |   test('lobby back button returns to menu', async ({ page }) => {
  59  |     await page.getByTestId('play-button').click();
  60  |     await expect(page.getByTestId('char-select')).toBeVisible();
> 61  |     await page.locator('.lobby-back-btn').click();
      |                                           ^ Error: locator.click: Test timeout of 30000ms exceeded.
  62  |     await expect(page.getByTestId('main-menu')).toBeVisible();
  63  |   });
  64  | 
  65  |   test('match shows pause button on mobile', async ({ page }) => {
  66  |     // Skip lobby via URL params
  67  |     await page.goto('/?mobile&arena=meadow&bots=1&killLimit=16');
  68  |     await expect(page.getByTestId('match-screen')).toBeVisible();
  69  |     await expect(page.getByTestId('mobile-pause-btn')).toBeVisible();
  70  |   });
  71  | 
  72  |   test('mobile pause button opens pause menu', async ({ page }) => {
  73  |     await page.goto('/?mobile&arena=meadow&bots=1&killLimit=16');
  74  |     await expect(page.getByTestId('match-screen')).toBeVisible();
  75  | 
  76  |     await page.getByTestId('mobile-pause-btn').click();
  77  |     await expect(page.getByTestId('pause-menu')).toBeVisible();
  78  |     await expect(page.getByTestId('resume-button')).toBeVisible();
  79  |   });
  80  | 
  81  |   test('touch overlay renders in match on mobile', async ({ page }) => {
  82  |     await page.goto('/?mobile&arena=meadow&bots=1&killLimit=16');
  83  |     await expect(page.getByTestId('match-screen')).toBeVisible();
  84  |     await expect(page.locator('.touch-overlay')).toBeVisible();
  85  |   });
  86  | 
  87  |   test('victory screen uses single-column layout on mobile', async ({ page }) => {
  88  |     // Quick match: 1 kill limit, wait for match to end
  89  |     await page.goto('/?mobile&arena=meadow&bots=1&killLimit=1&timeLimit=10');
  90  |     // Wait for victory screen (bots will fight, match ends by timeout at worst)
  91  |     await expect(page.getByTestId('victory-screen')).toBeVisible({ timeout: 30000 });
  92  |     // Check that victory-columns has single-column flex direction via .is-mobile rule
  93  |     const columns = page.locator('.victory-columns');
  94  |     await expect(columns).toHaveCSS('flex-direction', 'column');
  95  |   });
  96  | 
  97  |   test('pause arena grid uses 3 columns on mobile', async ({ page }) => {
  98  |     await page.goto('/?mobile&arena=meadow&bots=1&killLimit=16');
  99  |     await expect(page.getByTestId('match-screen')).toBeVisible();
  100 | 
  101 |     await page.getByTestId('mobile-pause-btn').click();
  102 |     await expect(page.getByTestId('pause-menu')).toBeVisible();
  103 | 
  104 |     // Open level select
  105 |     await page.locator('.level-btn').click();
  106 |     const grid = page.locator('.pause-arena-grid');
  107 |     await expect(grid).toBeVisible();
  108 |     // Computed value is resolved pixel widths, not the CSS repeat() — just check 3 values exist
  109 |     const cols = await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns);
  110 |     const colCount = cols.split(/\s+/).length;
  111 |     expect(colCount).toBe(3);
  112 |   });
  113 | });
  114 | 
  115 | test.describe('Desktop regression (@desktop)', () => {
  116 |   test('no mobile UI on desktop (no ?mobile param)', async ({ page }) => {
  117 |     await page.goto('/');
  118 |     await expect(page.locator('html.is-mobile')).not.toBeAttached();
  119 |     await expect(page.locator('.fullscreen-btn')).toBeVisible();
  120 |     await expect(page.locator('.controls-hint')).toBeVisible();
  121 |   });
  122 | 
  123 |   test('lobby loads normally on desktop', async ({ page }) => {
  124 |     await page.goto('/');
  125 |     await page.getByTestId('play-button').click();
  126 |     await expect(page.getByTestId('lobby-canvas')).toBeVisible();
  127 |     // No back button on desktop
  128 |     await expect(page.locator('.lobby-back-btn')).not.toBeVisible();
  129 |   });
  130 | 
  131 |   test('no pause button or touch overlay on desktop match', async ({ page }) => {
  132 |     await page.goto('/?arena=meadow&bots=1&killLimit=16');
  133 |     await expect(page.getByTestId('match-screen')).toBeVisible();
  134 |     await expect(page.locator('.mobile-pause-btn')).not.toBeVisible();
  135 |     await expect(page.locator('.touch-overlay')).not.toBeAttached();
  136 |   });
  137 | });
  138 | 
```