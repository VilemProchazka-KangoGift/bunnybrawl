# E2E Online Game Tests — Inventory

Multi-tab Playwright tests for the P2P online multiplayer flow.
Uses two browser contexts (Host + Guest) connecting via PeerJS.

## Prerequisites

- Tests need `data-testid` attributes on online UI elements (currently missing — see "Required Test IDs" below)
- PeerJS signaling server must be reachable (free server at 0.peerjs.com)
- For CI: consider self-hosted PeerJS server or mock signaling

## Test Structure

Each test creates two Playwright `BrowserContext`s (Host and Guest) from a single browser.
Host creates a room, Guest joins via the room code extracted from Host's UI.

```typescript
// Shared fixture pattern
async function createOnlineMatch(browser: Browser) {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  await host.goto('/');
  await guest.goto('/');
  return { host, guest, hostCtx, guestCtx };
}
```

---

## Test Cases

### Connection & Lobby

| # | Test | Steps | Verifies |
|---|------|-------|----------|
| 1 | **Host creates room and gets code** | Host: click Online > Create Room. Wait for room code to appear. | Room code is 3 uppercase chars, UI shows "Waiting for players" |
| 2 | **Guest joins with room code** | Host creates room. Guest: click Online > Join Room > enter code > Join. | Both reach lobby step, guest sees host's character |
| 3 | **Character selection syncs** | Both in lobby. Host changes character dropdown. | Guest sees updated character name in player list |
| 4 | **Host starts match** | Both in lobby. Host clicks "Start Game!". | Both navigate to match screen (`match-screen` visible) |
| 5 | **Invalid room code shows error** | Guest enters "ZZZ" (nonexistent code). | Error message appears, guest can go back |
| 6 | **Back button cleans up** | Host creates room, clicks Back. | Returns to choose step, transport destroyed |
| 7 | **Guest disconnect shows message** | Both in lobby. Guest closes tab. | Host stays in lobby or shows disconnect state |

### Match Play

| # | Test | Steps | Verifies |
|---|------|-------|----------|
| 8 | **Match starts with correct players** | Start online match with host=Bunny, guest=Fox. | Both canvases render, game-canvas visible on both tabs |
| 9 | **Input reaches remote player** | Host holds right arrow for 2 seconds. | Host's character moves right on guest's screen (verify via `window.__gameLoop.getState()`) |
| 10 | **Stomp registers on both clients** | Bot stomps a player (use `?bots=1`). | Kill feed updates on both, scores match |
| 11 | **Match ends simultaneously** | Play until kill limit reached. | Both reach victory screen, winner matches |
| 12 | **Pause syncs** | Host presses Escape to pause. | Guest sees pause overlay too |

### Victory & Rematch

| # | Test | Steps | Verifies |
|---|------|-------|----------|
| 13 | **Victory screen shows correct winner** | Match ends. | Winner name matches on both. Host sees "Rematch", Guest sees "Leave" |
| 14 | **Host rematch starts new match** | Host clicks Rematch on victory screen. | Both return to match screen, new match begins |
| 15 | **Guest leave returns to menu** | Guest clicks Leave on victory. | Guest returns to main menu, host stays on victory/lobby |
| 16 | **Host change arena + rematch** | Host clicks "Change Arena" on victory, picks a different arena. | New match starts on correct arena for both |

### Disconnect Handling

| # | Test | Steps | Verifies |
|---|------|-------|----------|
| 17 | **Guest disconnect mid-match** | Guest closes tab during match. | Host sees disconnect message or wins by forfeit |
| 18 | **Host disconnect mid-match** | Host closes tab during match. | Guest sees disconnect, can return to menu |
| 19 | **Reconnect after error** | Host creates room, PeerJS error simulated. | UI shows error message, Back button works, can retry |

### Desync & Network Quality

| # | Test | Steps | Verifies |
|---|------|-------|----------|
| 20 | **Debug overlay shows stats** | Start match with `?debug=net`. | Overlay renders with RTT, jitter, frame numbers |
| 21 | **Network simulator works** | Start with `?simLatency=100&simJitter=30`. | Game plays with visible input delay, no crash |
| 22 | **No desync over 60 seconds** | Run match with 1 bot for 60 seconds. | Hash check passes consistently (no correction messages in console) |

---

## Required Test IDs

These `data-testid` attributes need to be added to MainMenu.tsx online modal:

```
online-btn              — "Play Online" button (line 350, has class online-btn)
online-create-btn       — "Create Room" button (line 571)
online-join-btn         — "Join Room" button (line 579)
online-code-input       — Room code text input (line 590)
online-join-submit      — "Join" submit button (line 595)
online-room-code        — Room code display (line 609, the .online-code span)
online-char-select      — Character dropdown (line 649)
online-start-btn        — "Start Game!" button (line 694)
online-ready-btn        — Guest "Ready!" button (line 683)
online-back-btn         — Back button in lobby (line 701)
online-status           — Connection status text (line 623)
online-error            — Error message span (line 627)
online-player-list      — Player list container (line 663)
```

VictoryScreen.tsx already has: `victory-screen`, `rematch-button`, `menu-button`
Match.tsx already has: `match-screen`, `game-canvas`, `pause-menu`, `resume-button`, `quit-button`

---

## Implementation Notes

- **Timing**: Online tests are inherently slower (PeerJS signaling ~500ms, WebRTC handshake ~300ms). Use generous timeouts (10-15s for connection, 30s for match play).
- **Flakiness**: PeerJS free server can be unreliable. Tag all online tests `@online` and consider separate CI job with retries.
- **State verification**: Use `page.evaluate(() => window.__gameLoop?.getState())` to read game state from both tabs for position/score assertions.
- **Room code extraction**: Host creates room → extract code from `.online-code` element → paste into guest's input.
- **Bot-assisted tests**: Use `?bots=1` URL param to ensure matches end quickly without manual input.
