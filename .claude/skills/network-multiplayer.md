# Network Multiplayer Skill

Use when working on online play: WebRTC transport, host/guest loops, snapshots, interpolation, or net-related debugging.

## Architecture: Host-Authoritative

Online play uses host-authoritative architecture with **Trystero MQTT signaling** for P2P WebRTC. Host runs the full simulation and broadcasts compact binary snapshots to guests every tick. Guests send inputs to host, interpolate between received snapshots for smooth rendering. **No determinism requirements** — host is the single source of truth.

**Flow**: MainMenu (Online modal) → OnlineLobby (auto-create/join) → CharacterSelect (1 player, any keys) → Match (NetMatch drives host or guest loop)

## Key Files

| File | Purpose |
|------|---------|
| `net/transport.ts` | Trystero MQTT signaling + WebRTC data channels, RTT/jitter tracking |
| `net/hostAuthority.ts` | Host: input buffering, snapshot broadcast |
| `net/interpolation.ts` | Game-specific entity interpolation, extrapolation, `applySnapshotToState` |
| `net/snapshot.ts` | Binary snapshot encode/decode, Uint8 timer compression |
| `net/inputEcho.ts` | Guest visual feedback without position prediction (facing, anim, squash) |
| `net/netMatch/` | Thin orchestrator + 5 collaborators (see below) |
| `net/core/` | Generic netcode core (reusable foundation, zero game imports) |

### NetMatch Collaborators (`net/netMatch/`)

| Collaborator | Role |
|--------------|------|
| `NetMatch.ts` | Lifecycle + host/guest branching (~310 lines) |
| `NetMatchContext.ts` | Typed shared-state seam threaded between collaborators |
| `LoadingHandshake.ts` | Host-side LOADED handshake + 15s force-flip timeout |
| `ReconnectController.ts` | Guest-side reconnect retry loop |
| `MessageRouter.ts` | Reliable + unreliable MsgType switch |
| `HostLoop.ts` | Host's simulate + broadcast rAF loop |
| `GuestLoop.ts` | Guest's input-send + snapshot-apply rAF loop + wire handlers |

## Host Loop (`HostLoop`)

- Fixed-timestep accumulator drives `gameLoop.fixedUpdate()`
- After each tick: `hostAuthority.broadcastSnapshot(state)` sends binary snapshot to all guests
- **Input fairness delay**: host buffers own inputs by RTT/2 frames to match guest latency
- Guest inputs buffered in `HostAuthority.guestInputs` Map, read via `getNetworkInputs()`

## Guest Loop (`GuestLoop`)

- **No fixedUpdate** — guest only interpolates and renders
- Sends local input to host every frame via `transport.sendUnreliable()`
- Applies interpolated snapshot via `applySnapshotToState()` before rendering
- **Decays visual timers locally between snapshots**: invincible blink, slow tint, screen shake
- `renderFrame(dt)` decays `slowMotion` / `screenFlash` / `hitstopZoom`

## cosmeticStep Architecture

Both host and guest call `gameLoop.cosmeticStep(dt)` for all SFX, particles, VFX. Host calls after `fixedUpdate()`, guest calls after `applySnapshotToState()`. Transition detection via prev-state comparison. **No separate GuestSFX module.**

## Snapshot Encoding Rules

- **Timers as Uint8 frame counts**: `timer * 60`, clamped 0-255
- **Positions as Float32**
- **All timer decrements use `Math.max(0, ...)`** to prevent negative values wrapping to 255 in Uint8

## Transport Lifecycle

1. MainMenu modal creates Transport with lobby callbacks
2. `Transport.setEvents()` re-wires to match callbacks when NetMatch starts (**critical** — without this, the rollback engine never receives input messages → game freezes)
3. VictoryScreen re-wires transport for rematch / arena signals from host
4. On disconnect/quit: `transport.destroy()` + `resetOnline()`

Vite config needs `optimizeDeps.include: ['trystero']`.

## Online Lobby (CharacterSelect)

- In online mode, `playersRef.current` has only 1 entry (P1). `drawLobby` must guard against missing players.
- All 5 key bindings map to P1.
- START zone sends CHARACTER_SELECT + READY over transport.

## Player Names

`OnlineState.playerNames` maps slot → display name. Set in HANDSHAKE / SLOT_ASSIGNMENT handlers, consumed by `renderer.setPlayerNames()` for HUD and `VictoryScreen.charName()` for results. `RemotePlayerInfo.playerName` carries the canonical name per peer.

## Online Pause / Victory Role Separation

- Pause menu differs by role: host gets Resume / Change Level / Cancel Game; guest gets Resume / Leave Game.
- Victory screen: only host sees Rematch and Change Arena. Guest only sees Leave Game.
- Game doesn't actually pause in online mode — ESC just shows the overlay while the game continues.

## Network Simulator & Debug

- `?simLatency=50&simJitter=20&simLoss=5` URL params wrap transport receive path. Ping/pong bypasses simulator for real RTT measurement.
- `?debug=net` enables net stats overlay (RTT, jitter, frame advantage, snapshot rate). Toggle with backtick key.
- Jitter tracking: `Transport.currentJitter` (EMA of `|rtt - smoothedRtt|`).

## E2E Diagnostics

`window.__bunnyTest.netStats()` for RTT/frame/snapshot stats; `window.__bunnyTest.netMatch()` for the full NetMatch instance; `window.__bunnyTest.latestSnapshotFrame()` for the last applied frame.

## Code Quality Patterns

- **NEVER use hex literals (`0x02`, `0x08`) for message types** — always use `MsgType.SETTINGS_SYNC`, `MsgType.START_MATCH`, etc. Hex literals silently bypass type checking and are unreadable.
- `as any` casts should be `as ReliableMessage` or proper type narrowing. Every `as any` is a potential desync bug waiting to happen.
- The generic core (`net/core/`) has zero game imports — keep it that way so it can be lifted into a separate library.

## Match End / Victory / Rematch

- `onMatchEnd` only fires locally — host must send `MATCH_RESULT` to guest so both transition to victory screen. Without this, guest freezes after match ends.
- NetMatch stores `onMatchEnd` callback and handles incoming MATCH_RESULT by calling it with the guest's local state.
- Transport must survive across Match → VictoryScreen → Match cycle for rematch. Effect cleanup stops NetMatch but does NOT destroy transport. Transport destroyed only on explicit quit/menu.
- VictoryScreen "menu" button must `transport.destroy()` + `resetOnline()`.
- Arena changes (pause menu + victory) must send `SETTINGS_SYNC` to guest — otherwise peers play in different arenas.
- Rematch/arena from victory: host sends `START_MATCH` (+ `SETTINGS_SYNC` for arena change). Guest VictoryScreen wires `transport.setEvents` on mount to receive these.
- Disconnect during match → navigate to victory screen with `disconnectWin` flag. Shows "Game ended — player disconnected" with Leave Game only (no rematch/arena).

## React + Network Pitfalls (Still Applicable)

1. **`useEffect` cleanup with deps** — `[online.connectionStatus]` in deps causes cleanup to fire on every status change. The stale closure destroys the transport mid-connection. Use empty deps `[]` for unmount-only cleanup + a ref (`transitioningToMatch`) to skip cleanup when transitioning.
2. **`useCallback` captures stale Zustand state** — when `startMatch` reads `online.remoteCharacterName`, it gets the value from the last render, not the current store. Network messages arrive synchronously but React batches state updates. Use refs (`remoteCharRef.current`) updated in message handlers for values consumed in callbacks.
3. **HANDSHAKE echo loop** — both sides send HANDSHAKE on connect. If the handler echoes it back, infinite ping-pong. Handler must be no-op for HANDSHAKE.
4. **CHARACTER_SELECT cascade** — if auto-switch logic sends a new CHARACTER_SELECT on receiving one, and both peers do this, infinite loop. Remove auto-switch from message handler. Filter the UI dropdown instead.

## React Strict Mode + Effects

- React dev mode double-invokes effects: mount → unmount → mount. If setup and cleanup are in SEPARATE `useEffect([], [])` calls, cleanup destroys the transport on first unmount, but the setup ref guard (`startedRef`) stays `true` so the second mount skips recreation → transport is dead.
- **Fix**: merge setup + cleanup into ONE `useEffect` with matched return.
- Never use a `startedRef` guard in effects that need to survive Strict Mode — the ref persists across the unmount/remount cycle.
- Read store state inside the effect body via `useGameStore.getState()` instead of capturing from render closure.

## Testing

- Use Simulator-level tests for game logic round-trips (no audio/canvas mocks needed). See `testing.md`.
- Online E2E tests are inherently flaky (`@online` tag) due to Trystero MQTT signaling. Use URL param auto-start + `waitForFunction` polling. Never hardcoded waits.
- Interpolation tests: snapshots pushed in rapid succession have near-identical frame numbers relative to delay. Assert value **ranges**, not exact lerp results.

---

## Legacy: PeerJS / Rollback Lessons (Archive)

> **Note**: The codebase migrated from PeerJS rollback netcode to Trystero host-authoritative. The lessons below are kept for reference — none of this code remains in `main`, but the pitfalls were costly to learn.

### Determinism (no longer required, but instructive)

- 12 gameplay `Math.random()` calls were replaced with `gameRandom()` (seeded mulberry32 PRNG). Cosmetic randomness (~234 calls) was intentionally left as `Math.random()`.
- `randRange()` in `themes/utils.ts` uses `Math.random()` internally — inline the math for any future deterministic paths.
- `assignBotCharacters` used `Math.random()` for shuffle — each peer got different bot characters → different AI → instant desync. Fixed with optional seed.
- AI personalities amplified desync; were disabled (all bots used neutral DEFAULT_PERSONALITY).
- `InputManager.getInput('P1')` only reads WASD. Online play needed `getInputAny()` merging all 5 key bindings.

### PeerJS Pitfalls

1. `serialization: 'none'` broke Vite — the `sdp` dependency is CJS-only. Default `'binary'` worked. Add `optimizeDeps.include: ['peerjs']`.
2. `conn.open` race — DataConnection may already be open when `peer.on('connection')` fires. Always check `conn.open` after attaching the listener.
3. `data instanceof ArrayBuffer` insufficient — PeerJS may deliver `Uint8Array`. Add fallback: `data.buffer instanceof ArrayBuffer`.
4. Free signaling server (`0.peerjs.com`) flaky — always 10s timeout + clear errors. Self-hosted `npx peer --port 9000` was reliable.

### Rollback Engine Pitfalls

1. **Snapshot timing is critical** — `snapshot[f]` MUST represent state BEFORE tick f. Taking snapshot AFTER `fixedUpdate` but storing at the same frame index causes +1dt drift per rollback, compounding into high-speed mode.
2. **Don't rollback every frame** — track `lastSyncedFrame`. Only rollback when `remoteConfirmedFrame > lastSyncedFrame`. Otherwise confirmed flags are never cleared.
3. **Real-time timers in network mode** — `slowMotion`, `screenFlash`, `hitstopZoom` were decremented in `loop()` which doesn't run in network mode. Must decay in `renderFrame(frameDt)` instead.

### Visual Correction Smoothing

- `Player.renderOffsetX/Y` were visual-only fields (not in snapshots/hash). Set after rollback to smooth position corrections.
- Decay: `*= 0.7` per frame (~3-5 frames to settle). Large corrections (>30px) snap instantly.
- Excluded from snapshot/hash. Initialized to 0 in player creation.

### Zero-Allocation Hot Path Patterns (still relevant in places)

- **Snapshot pool**: `takeSnapshotInto()` copies into pre-allocated objects. `createEmptySnapshot()` for ring buffer init.
- **Input map**: reuse single `Map` with `.clear()` instead of `new Map()` per frame.
- **Pre-allocated `_anyInput`**: `InputManager.getInputAny()` reuses one `InputState` object — no spread copies.
- **Return const references** (like `NO_INPUT`) instead of spreading copies in cold paths too.
