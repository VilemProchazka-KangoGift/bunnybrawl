# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: online-multiplayer.spec.ts >> Online Multiplayer — Pause >> host sees Cancel Game, guest sees Leave Game in pause menu
- Location: e2e\online-multiplayer.spec.ts:308:3

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
  265 |       await expect(pair.guest.getByTestId('pause-menu')).toBeVisible({ timeout: 5000 });
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
> 317 |       await expect(pair.guest.getByTestId('pause-menu')).toBeVisible({ timeout: 5000 });
      |                                                          ^ Error: expect(locator).toBeVisible() failed
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
  366 |       expect(hostVictoryText).toContain('Zara');
  367 |       expect(hostVictoryText).toContain('Kai');
  368 | 
  369 |       const guestVictoryText = await pair.guest.getByTestId('victory-screen').textContent();
  370 |       expect(guestVictoryText).toContain('Zara');
  371 |       expect(guestVictoryText).toContain('Kai');
  372 |     } finally {
  373 |       await closePair(pair);
  374 |     }
  375 |   });
  376 | 
  377 |   test('host sees Rematch + Change Arena, guest sees Leave', async ({ browser }) => {
  378 |     const pair = await createPair(browser);
  379 |     try {
  380 |       await setShortTimeLimit(pair.host, 5);
  381 |       await connectToLobby(pair);
  382 |       await pair.host.getByTestId('online-start-btn').click();
  383 |       await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
  384 | 
  385 |       await expect(pair.host.getByTestId('victory-screen')).toBeVisible({ timeout: 20000 });
  386 |       await expect(pair.guest.getByTestId('victory-screen')).toBeVisible({ timeout: 5000 });
  387 | 
  388 |       // Host sees rematch and change arena buttons
  389 |       await expect(pair.host.getByTestId('rematch-button')).toBeVisible();
  390 |       await expect(pair.host.getByTestId('change-arena-button')).toBeVisible();
  391 |       await expect(pair.host.getByTestId('menu-button')).toBeVisible();
  392 | 
  393 |       // Guest only sees Leave button (no rematch/arena)
  394 |       await expect(pair.guest.getByTestId('rematch-button')).not.toBeVisible();
  395 |       await expect(pair.guest.getByTestId('change-arena-button')).not.toBeVisible();
  396 |       await expect(pair.guest.getByTestId('menu-button')).toBeVisible();
  397 |     } finally {
  398 |       await closePair(pair);
  399 |     }
  400 |   });
  401 | 
  402 |   test('host rematch starts a new match for both', async ({ browser }) => {
  403 |     const pair = await createPair(browser);
  404 |     try {
  405 |       await setShortTimeLimit(pair.host, 5);
  406 |       await connectToLobby(pair);
  407 |       await pair.host.getByTestId('online-start-btn').click();
  408 | 
  409 |       // Wait for first match to end
  410 |       await expect(pair.host.getByTestId('victory-screen')).toBeVisible({ timeout: 25000 });
  411 |       await expect(pair.guest.getByTestId('victory-screen')).toBeVisible({ timeout: 5000 });
  412 | 
  413 |       // Host clicks Rematch
  414 |       await pair.host.getByTestId('rematch-button').click();
  415 | 
  416 |       // Both should enter a new match
  417 |       await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
```