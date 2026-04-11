# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: online-multiplayer.spec.ts >> Online Multiplayer — Pause >> host pause shows overlay on both screens
- Location: e2e\online-multiplayer.spec.ts:252:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('pause-menu')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByTestId('pause-menu')

```

# Test source

```ts
  165 |   test('create/join buttons hidden without name, visible with name', async ({ browser }) => {
  166 |     const pair = await createPair(browser);
  167 |     try {
  168 |       await openOnlineModal(pair.host);
  169 |       // Buttons should not exist when name is empty
  170 |       await expect(pair.host.getByTestId('online-create-btn')).not.toBeVisible();
  171 |       await expect(pair.host.getByTestId('online-join-btn')).not.toBeVisible();
  172 | 
  173 |       // Fill name → buttons appear
  174 |       await pair.host.getByTestId('online-name-input').fill('TestPlayer');
  175 |       await expect(pair.host.getByTestId('online-create-btn')).toBeVisible();
  176 |       await expect(pair.host.getByTestId('online-join-btn')).toBeVisible();
  177 |     } finally {
  178 |       await closePair(pair);
  179 |     }
  180 |   });
  181 | 
  182 |   test('player name persists across sessions', async ({ browser }) => {
  183 |     const ctx = await browser.newContext();
  184 |     const page = await ctx.newPage();
  185 |     await page.goto('/');
  186 |     try {
  187 |       // Enter a name
  188 |       await openOnlineModal(page);
  189 |       await page.getByTestId('online-name-input').fill('PersistMe');
  190 | 
  191 |       // Close modal and reopen — name should be preserved
  192 |       await page.keyboard.press('Escape');
  193 |       await page.waitForTimeout(200);
  194 |       await openOnlineModal(page);
  195 |       await expect(page.getByTestId('online-name-input')).toHaveValue('PersistMe');
  196 |     } finally {
  197 |       await ctx.close();
  198 |     }
  199 |   });
  200 | 
  201 |   test('invalid room code shows error', async ({ browser }) => {
  202 |     const guestCtx = await browser.newContext();
  203 |     const guest = await guestCtx.newPage();
  204 |     await guest.goto('/');
  205 |     try {
  206 |       await openOnlineModal(guest);
  207 |       await guest.getByTestId('online-name-input').fill('TestPlayer');
  208 |       await guest.getByText('Join Room').click();
  209 |       await guest.getByTestId('online-code-input').fill('ZZZ');
  210 |       await guest.getByTestId('online-join-submit').click();
  211 |       await expect(guest.locator('.online-error')).toBeVisible({ timeout: 15000 });
  212 |     } finally {
  213 |       await guestCtx.close();
  214 |     }
  215 |   });
  216 | });
  217 | 
  218 | test.describe('Online Multiplayer — Match Start', { tag: '@online' }, () => {
  219 |   test.setTimeout(60000);
  220 | 
  221 |   test('host starts match and both enter game', async ({ browser }) => {
  222 |     const pair = await createPair(browser);
  223 |     try {
  224 |       await startOnlineMatch(pair);
  225 |       await expect(pair.host.getByTestId('game-canvas')).toBeVisible();
  226 |       await expect(pair.guest.getByTestId('game-canvas')).toBeVisible();
  227 |     } finally {
  228 |       await closePair(pair);
  229 |     }
  230 |   });
  231 | 
  232 |   test('match does not freeze during countdown', async ({ browser }) => {
  233 |     const pair = await createPair(browser);
  234 |     try {
  235 |       await startOnlineMatch(pair);
  236 |       await waitPastCountdown(pair.host);
  237 | 
  238 |       const hostTime = await pair.host.evaluate(() => {
  239 |         const gl = (window as any).__gameLoop;
  240 |         return gl ? gl.getState().timeElapsed : -1;
  241 |       });
  242 |       expect(hostTime).toBeGreaterThan(0.5);
  243 |     } finally {
  244 |       await closePair(pair);
  245 |     }
  246 |   });
  247 | });
  248 | 
  249 | test.describe('Online Multiplayer — Pause', { tag: '@online' }, () => {
  250 |   test.setTimeout(60000);
  251 | 
  252 |   test('host pause shows overlay on both screens', async ({ browser }) => {
  253 |     const pair = await createPair(browser);
  254 |     try {
  255 |       await startOnlineMatch(pair);
  256 |       await waitPastCountdown(pair.host);
  257 | 
  258 |       // Host presses Escape to pause
  259 |       await pair.host.keyboard.press('Escape');
  260 | 
  261 |       // Host sees pause overlay
  262 |       await expect(pair.host.getByTestId('pause-menu')).toBeVisible({ timeout: 3000 });
  263 | 
  264 |       // Guest should also see pause (synced via PAUSE message)
> 265 |       await expect(pair.guest.getByTestId('pause-menu')).toBeVisible({ timeout: 5000 });
      |                                                          ^ Error: expect(locator).toBeVisible() failed
  266 |     } finally {
  267 |       await closePair(pair);
  268 |     }
  269 |   });
  270 | 
  271 |   test('host resume hides overlay on both screens', async ({ browser }) => {
  272 |     const pair = await createPair(browser);
  273 |     try {
  274 |       await startOnlineMatch(pair);
  275 |       await waitPastCountdown(pair.host);
  276 | 
  277 |       // Pause
  278 |       await pair.host.keyboard.press('Escape');
  279 |       await expect(pair.host.getByTestId('pause-menu')).toBeVisible({ timeout: 3000 });
  280 | 
  281 |       // Resume
  282 |       await pair.host.getByTestId('resume-button').click();
  283 | 
  284 |       // Both should no longer show pause
  285 |       await expect(pair.host.getByTestId('pause-menu')).not.toBeVisible({ timeout: 3000 });
  286 |       await expect(pair.guest.getByTestId('pause-menu')).not.toBeVisible({ timeout: 5000 });
  287 |     } finally {
  288 |       await closePair(pair);
  289 |     }
  290 |   });
  291 | 
  292 |   test('guest pause shows overlay on both screens', async ({ browser }) => {
  293 |     const pair = await createPair(browser);
  294 |     try {
  295 |       await startOnlineMatch(pair);
  296 |       await waitPastCountdown(pair.guest);
  297 | 
  298 |       // Guest presses Escape
  299 |       await pair.guest.keyboard.press('Escape');
  300 | 
  301 |       await expect(pair.guest.getByTestId('pause-menu')).toBeVisible({ timeout: 3000 });
  302 |       await expect(pair.host.getByTestId('pause-menu')).toBeVisible({ timeout: 5000 });
  303 |     } finally {
  304 |       await closePair(pair);
  305 |     }
  306 |   });
  307 | 
  308 |   test('host sees Cancel Game, guest sees Leave Game in pause menu', async ({ browser }) => {
  309 |     const pair = await createPair(browser);
  310 |     try {
  311 |       await startOnlineMatch(pair);
  312 |       await waitPastCountdown(pair.host);
  313 | 
  314 |       // Both pause
  315 |       await pair.host.keyboard.press('Escape');
  316 |       await expect(pair.host.getByTestId('pause-menu')).toBeVisible({ timeout: 3000 });
  317 |       await expect(pair.guest.getByTestId('pause-menu')).toBeVisible({ timeout: 5000 });
  318 | 
  319 |       // Both have a quit button visible in the pause menu
  320 |       await expect(pair.host.getByTestId('quit-button')).toBeVisible();
  321 |       await expect(pair.guest.getByTestId('quit-button')).toBeVisible();
  322 |     } finally {
  323 |       await closePair(pair);
  324 |     }
  325 |   });
  326 | });
  327 | 
  328 | test.describe('Online Multiplayer — Victory Screen', { tag: '@online' }, () => {
  329 |   test.setTimeout(60000);
  330 | 
  331 |   test('match ends by time and both see victory screen', async ({ browser }) => {
  332 |     const pair = await createPair(browser);
  333 |     try {
  334 |       await setShortTimeLimit(pair.host, 5);
  335 |       await connectToLobby(pair);
  336 |       await pair.host.getByTestId('online-start-btn').click();
  337 |       await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
  338 | 
  339 |       // Wait for match to end (3s countdown + 5s match + buffer)
  340 |       await expect(pair.host.getByTestId('victory-screen')).toBeVisible({ timeout: 20000 });
  341 |       await expect(pair.guest.getByTestId('victory-screen')).toBeVisible({ timeout: 5000 });
  342 |     } finally {
  343 |       await closePair(pair);
  344 |     }
  345 |   });
  346 | 
  347 |   test('victory screen shows player names instead of animal names', async ({ browser }) => {
  348 |     const pair = await createPair(browser);
  349 |     try {
  350 |       await setShortTimeLimit(pair.host, 5);
  351 |       // Use specific names
  352 |       const code = await hostCreateRoom(pair.host, 'Zara');
  353 |       await guestJoinRoom(pair.guest, code, 'Kai');
  354 |       await waitForLobby(pair.host);
  355 |       await waitForLobby(pair.guest);
  356 | 
  357 |       await pair.host.getByTestId('online-start-btn').click();
  358 |       await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
  359 | 
  360 |       // Wait for match to end
  361 |       await expect(pair.host.getByTestId('victory-screen')).toBeVisible({ timeout: 20000 });
  362 |       await expect(pair.guest.getByTestId('victory-screen')).toBeVisible({ timeout: 5000 });
  363 | 
  364 |       // Victory screen should show player names
  365 |       const hostVictoryText = await pair.host.getByTestId('victory-screen').textContent();
```