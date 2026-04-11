# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: game-flow.spec.ts >> Carrot Royale E2E >> shows main menu on load
- Location: e2e\game-flow.spec.ts:8:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByAltText('Carrot Royale')
Expected: visible
Error: strict mode violation: getByAltText('Carrot Royale') resolved to 2 elements:
    1) <img alt="Carrot Royale" src="/bunnybrawl/logo.png"/> aka locator('#loading-screen').getByRole('img', { name: 'Carrot Royale' })
    2) <img class="game-logo" alt="Carrot Royale" src="/bunnybrawl/logo.png"/> aka getByTestId('main-menu').getByRole('img', { name: 'Carrot Royale' })

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByAltText('Carrot Royale')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e7]:
    - generic [ref=e8]:
      - button "🎵" [ref=e9] [cursor=pointer]
      - img "Carrot Royale" [ref=e10]
      - paragraph [ref=e11]: Bez chemie, bez slitování.
      - paragraph [ref=e12]: Až 5 hráčů na jedné klávesnici!
      - generic [ref=e13]:
        - button "Hrát lokálně" [ref=e14] [cursor=pointer]:
          - img [ref=e15]
          - text: Hrát lokálně
        - button "Online" [ref=e17] [cursor=pointer]:
          - img [ref=e18]
          - text: Online
      - generic [ref=e21]:
        - generic [ref=e22]: Aréna
        - generic [ref=e23]:
          - button "🌿 Louka" [ref=e24] [cursor=pointer]:
            - generic [ref=e26]: 🌿
            - generic [ref=e27]: Louka
          - button "❄️ Zamrzlé jezero" [ref=e28] [cursor=pointer]:
            - generic [ref=e30]: ❄️
            - generic [ref=e31]: Zamrzlé jezero
          - button "🌋 Sopka" [ref=e32] [cursor=pointer]:
            - generic [ref=e34]: 🌋
            - generic [ref=e35]: Sopka
          - button "🏰 Hrad" [ref=e36] [cursor=pointer]:
            - generic [ref=e38]: 🏰
            - generic [ref=e39]: Hrad
          - button "🍭 Cukrárna" [ref=e40] [cursor=pointer]:
            - generic [ref=e42]: 🍭
            - generic [ref=e43]: Cukrárna
          - button "🌳 Koruny stromů" [ref=e44] [cursor=pointer]:
            - generic [ref=e46]: 🌳
            - generic [ref=e47]: Koruny stromů
          - button "🐠 Pod vodou" [ref=e48] [cursor=pointer]:
            - generic [ref=e50]: 🐠
            - generic [ref=e51]: Pod vodou
          - button "👻 Strašidelný hřbitov" [ref=e52] [cursor=pointer]:
            - generic [ref=e54]: 👻
            - generic [ref=e55]: Strašidelný hřbitov
          - button "🏙️ Střechy" [ref=e56] [cursor=pointer]:
            - generic [ref=e58]: 🏙️
            - generic [ref=e59]: Střechy
          - button "🚀 Vesmírná stanice" [ref=e60] [cursor=pointer]:
            - generic [ref=e62]: 🚀
            - generic [ref=e63]: Vesmírná stanice
          - button "💧 Vodopád" [ref=e64] [cursor=pointer]:
            - generic [ref=e66]: 💧
            - generic [ref=e67]: Vodopád
          - button "🎲 Náhodná" [ref=e68] [cursor=pointer]:
            - generic [ref=e70]: 🎲
            - generic [ref=e71]: Náhodná
      - generic [ref=e74]:
        - generic [ref=e75]: Bot
        - button "-" [disabled] [ref=e76]
        - generic [ref=e77]: "0"
        - button "+" [ref=e78] [cursor=pointer]
      - generic [ref=e79] [cursor=pointer]:
        - checkbox "Krvavý režim" [ref=e80]
        - generic [ref=e81]: Krvavý režim
      - generic [ref=e82] [cursor=pointer]:
        - generic [ref=e84]:
          - img [ref=e85]
          - text: EN
        - generic [ref=e91]:
          - text: "|"
          - generic [ref=e92]:
            - img [ref=e93]
            - text: CS
        - generic [ref=e97]:
          - text: "|"
          - generic [ref=e98]:
            - img [ref=e99]
            - text: HI
        - generic [ref=e104]:
          - text: "|"
          - generic [ref=e105]:
            - img [ref=e106]
            - text: FIL
      - button "?" [ref=e111] [cursor=pointer]
      - button "Mody" [ref=e112] [cursor=pointer]
    - generic: Apr 11, 2026 09:40 PM
  - button "⤢" [ref=e113] [cursor=pointer]
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
> 10 |     await expect(page.getByAltText('Carrot Royale')).toBeVisible();
     |                                                      ^ Error: expect(locator).toBeVisible() failed
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
  59 |     await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 40000 });
  60 |     await expect(page.getByTestId('game-canvas')).toBeVisible();
  61 |   });
  62 | 
  63 |   test('gore toggle exists on menu', async ({ page }) => {
  64 |     await expect(page.getByTestId('gore-toggle')).toBeVisible();
  65 |   });
  66 | });
  67 | 
```