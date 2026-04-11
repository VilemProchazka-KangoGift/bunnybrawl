# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: online-multiplayer.spec.ts >> Online Multiplayer — Connection >> player names shown in lobby and propagated to match
- Location: e2e\online-multiplayer.spec.ts:127:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:4173/
Call log:
  - navigating to "http://localhost:4173/", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
  2   | 
  3   | /**
  4   |  * E2E tests for online multiplayer (P2P via PeerJS).
  5   |  * Uses two browser contexts (Host + Guest) connecting through the free PeerJS signaling server.
  6   |  *
  7   |  * Tag: @online — these tests require network access and are inherently slower.
  8   |  * Debug params: ?killLimit=4&timeLimit=30 for fast matches.
  9   |  *
  10  |  * NOTE: Tests that require two peers to connect depend on PeerJS free signaling server
  11  |  * (0.peerjs.com) which is rate-limited and occasionally unreliable. For reliable CI,
  12  |  * run a local PeerJS server: npx peerjs --port 9000
  13  |  * Then update Transport constructor to use { host: 'localhost', port: 9000 }.
  14  |  */
  15  | 
  16  | // ---- Helpers ----
  17  | 
  18  | interface OnlinePair {
  19  |   host: Page;
  20  |   guest: Page;
  21  |   hostCtx: BrowserContext;
  22  |   guestCtx: BrowserContext;
  23  | }
  24  | 
  25  | async function openOnlineModal(page: Page) {
  26  |   await page.getByTestId('online-btn').click();
  27  |   await page.waitForTimeout(200); // modal animation
  28  | }
  29  | 
  30  | async function hostCreateRoom(page: Page, name = 'Host'): Promise<string> {
  31  |   await openOnlineModal(page);
  32  |   await page.getByTestId('online-name-input').fill(name);
  33  |   await page.getByTestId('online-create-btn').click();
  34  |   const codeEl = page.getByTestId('online-room-code');
  35  |   await expect(codeEl).toBeVisible({ timeout: 15000 });
  36  |   const code = await codeEl.textContent();
  37  |   expect(code).toMatch(/^[A-Z2-9]{3}$/);
  38  |   return code!;
  39  | }
  40  | 
  41  | async function guestJoinRoom(page: Page, code: string, name = 'Guest') {
  42  |   await openOnlineModal(page);
  43  |   await page.getByTestId('online-name-input').fill(name);
  44  |   await page.getByTestId('online-join-btn').click();
  45  |   await page.getByTestId('online-code-input').fill(code);
  46  |   await page.getByTestId('online-join-submit').click();
  47  | }
  48  | 
  49  | async function waitForLobby(page: Page) {
  50  |   const startBtn = page.getByTestId('online-start-btn');
  51  |   const readyBtn = page.getByTestId('online-ready-btn');
  52  |   await expect(startBtn.or(readyBtn)).toBeVisible({ timeout: 15000 });
  53  | }
  54  | 
  55  | async function createPair(browser: Browser): Promise<OnlinePair> {
  56  |   const hostCtx = await browser.newContext();
  57  |   const guestCtx = await browser.newContext();
  58  |   const host = await hostCtx.newPage();
  59  |   const guest = await guestCtx.newPage();
  60  |   host.on('console', msg => { if (msg.type() === 'error') console.log(`[HOST] ${msg.text()}`); });
  61  |   guest.on('console', msg => { if (msg.type() === 'error') console.log(`[GUEST] ${msg.text()}`); });
> 62  |   await host.goto('/');
      |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:4173/
  63  |   await guest.goto('/');
  64  |   return { host, guest, hostCtx, guestCtx };
  65  | }
  66  | 
  67  | /** Connect both peers and reach the lobby. */
  68  | async function connectToLobby(pair: OnlinePair): Promise<string> {
  69  |   const code = await hostCreateRoom(pair.host);
  70  |   await guestJoinRoom(pair.guest, code);
  71  |   await waitForLobby(pair.host);
  72  |   await waitForLobby(pair.guest);
  73  |   return code;
  74  | }
  75  | 
  76  | /** Connect, start the match, and wait for both to enter match screen. */
  77  | async function startOnlineMatch(pair: OnlinePair) {
  78  |   await connectToLobby(pair);
  79  |   await pair.host.getByTestId('online-start-btn').click();
  80  |   await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
  81  |   await expect(pair.guest.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
  82  | }
  83  | 
  84  | /** Wait past countdown (~3s) so gameplay is active. */
  85  | async function waitPastCountdown(page: Page) {
  86  |   await page.waitForTimeout(4000);
  87  | }
  88  | 
  89  | /** Set a short time limit on the host so the match ends quickly. */
  90  | async function setShortTimeLimit(page: Page, seconds = 5) {
  91  |   await page.evaluate((s) => {
  92  |     (window as any).__gameStore?.getState().setMatchSettings({ timeLimit: s });
  93  |   }, seconds);
  94  | }
  95  | 
  96  | async function closePair(pair: OnlinePair) {
  97  |   await pair.hostCtx.close().catch(() => {});
  98  |   await pair.guestCtx.close().catch(() => {});
  99  | }
  100 | 
  101 | // ---- Tests ----
  102 | 
  103 | test.describe('Online Multiplayer — Connection', { tag: '@online' }, () => {
  104 |   test.setTimeout(60000);
  105 | 
  106 |   test('host creates room and gets 3-char code', async ({ browser }) => {
  107 |     const pair = await createPair(browser);
  108 |     try {
  109 |       const code = await hostCreateRoom(pair.host);
  110 |       expect(code).toHaveLength(3);
  111 |     } finally {
  112 |       await closePair(pair);
  113 |     }
  114 |   });
  115 | 
  116 |   test('guest joins room and both reach lobby', async ({ browser }) => {
  117 |     const pair = await createPair(browser);
  118 |     try {
  119 |       await connectToLobby(pair);
  120 |       await expect(pair.host.getByTestId('online-start-btn')).toBeVisible();
  121 |       await expect(pair.guest.getByTestId('online-ready-btn')).toBeVisible();
  122 |     } finally {
  123 |       await closePair(pair);
  124 |     }
  125 |   });
  126 | 
  127 |   test('player names shown in lobby and propagated to match', async ({ browser }) => {
  128 |     const pair = await createPair(browser);
  129 |     try {
  130 |       const code = await hostCreateRoom(pair.host, 'Alice');
  131 |       await guestJoinRoom(pair.guest, code, 'Bob');
  132 |       await waitForLobby(pair.host);
  133 |       await waitForLobby(pair.guest);
  134 | 
  135 |       // Host lobby: should show "Alice" (you) and "Bob" for guest
  136 |       await expect(pair.host.locator('.online-player-list')).toContainText('Alice');
  137 |       await expect(pair.host.locator('.online-player-list')).toContainText('Bob');
  138 | 
  139 |       // Guest lobby: should show "Bob" (you) and "Alice" for host
  140 |       await expect(pair.guest.locator('.online-player-list')).toContainText('Bob');
  141 |       await expect(pair.guest.locator('.online-player-list')).toContainText('Alice');
  142 | 
  143 |       // Start match and verify playerNames in store
  144 |       await pair.host.getByTestId('online-start-btn').click();
  145 |       await expect(pair.host.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
  146 |       await expect(pair.guest.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
  147 | 
  148 |       // Check playerNames map on both sides
  149 |       const hostNames = await pair.host.evaluate(() => {
  150 |         return (window as any).__gameStore?.getState().online.playerNames;
  151 |       });
  152 |       const guestNames = await pair.guest.evaluate(() => {
  153 |         return (window as any).__gameStore?.getState().online.playerNames;
  154 |       });
  155 | 
  156 |       expect(hostNames['P1']).toBe('Alice');
  157 |       expect(hostNames['P2']).toBe('Bob');
  158 |       expect(guestNames['P1']).toBe('Alice');
  159 |       expect(guestNames['P2']).toBe('Bob');
  160 |     } finally {
  161 |       await closePair(pair);
  162 |     }
```