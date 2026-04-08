# Network Multiplayer — Lessons & Patterns

## Architecture
P2P WebRTC via PeerJS with GGPO-style rollback netcode. Free signaling at `0.peerjs.com` (unreliable — add 10s timeout). Room codes: 4 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.

## Determinism
- 12 gameplay `Math.random()` calls replaced with `this.gameRandom()` (seeded via mulberry32 PRNG)
- Cosmetic randomness (particles, weather, ~234 calls) intentionally left as `Math.random()`
- `randRange()` in `themes/utils.ts` uses `Math.random()` internally — inline the math for gameplay paths
- No trig (`Math.sin/cos`) in physics — safe for cross-browser determinism

## PeerJS Pitfalls (discovered the hard way)
1. **`serialization: 'none'` breaks Vite** — the `sdp` dependency is CJS-only, PeerJS's ESM import fails. Use default `'binary'` serialization. Also add `optimizeDeps.include: ['peerjs']` to vite.config.ts.
2. **`conn.open` race condition** — when host receives `peer.on('connection')`, the DataConnection may already be open. Always check `conn.open` after attaching `conn.on('open')` listener.
3. **`data instanceof ArrayBuffer` insufficient** — PeerJS binary serialization may deliver `Uint8Array`. Add fallback: `data.buffer instanceof ArrayBuffer`.
4. **Free signaling server flaky** — `0.peerjs.com` drops WebSocket connections. Always add a timeout (10s) and clear error messages. Self-hosted `npx peer --port 9000` works reliably for testing.

## Rollback Engine Pitfalls
1. **Snapshot timing is critical** — `snapshot[f]` MUST represent state BEFORE tick f. Taking snapshot AFTER `fixedUpdate` but storing at the same frame index causes +1dt drift per rollback, compounding into high-speed mode.
2. **Don't rollback every frame** — track `lastSyncedFrame`. Only rollback when `remoteConfirmedFrame > lastSyncedFrame`. Without this, confirmed flags are never cleared and resimulation happens needlessly.
3. **Real-time timers in network mode** — `slowMotion`, `screenFlash`, `hitstopZoom` are decremented in `loop()` which doesn't run in network mode. Must decay in `renderFrame(frameDt)` instead. Missing this causes kills to freeze visual effects permanently.
4. **Audio during resimulation** — `playSound()` wrapper + `setAudioEnabled(false)` before resim, `true` after. The `replace_all` of `audio.play` → `this.playSound` also replaced the call INSIDE `playSound` itself, creating infinite recursion. Always verify self-referential replacements.

## React + Network Pitfalls
1. **useEffect cleanup with deps** — `[online.connectionStatus]` in deps causes cleanup to fire on every status change. The stale closure destroys the transport mid-connection. Use empty deps `[]` for unmount-only cleanup + a ref (`transitioningToMatch`) to skip cleanup when transitioning.
2. **useCallback captures stale Zustand state** — when `startMatch` reads `online.remoteCharacterName`, it gets the value from the last render, not the current store. PeerJS messages arrive synchronously but React batches state updates. Use refs (`remoteCharRef.current`) updated in message handlers for values consumed in callbacks.
3. **HANDSHAKE echo loop** — both sides send HANDSHAKE on connect. If the handler echoes it back, infinite ping-pong. Handler must be no-op for HANDSHAKE.
4. **CHARACTER_SELECT cascade** — if auto-switch logic sends a new CHARACTER_SELECT on receiving one, and both peers do this, infinite loop. Remove auto-switch from message handler. Filter the UI dropdown instead.
5. **Both peers default to same character** — guest should default to P2 character (Fox), not P1 (Bunny). Set before `setupTransport()` so the closure captures it.

## CharacterSelect Online Mode
- Only P1 in `playersRef.current` — `drawLobby` must guard against missing players (was crashing accessing `players[i].char` for i > 0)
- All 5 key bindings map to P1: `const bindingsToCheck = isOnline ? Object.values(KEY_BINDINGS) : [KEY_BINDINGS[slot]]`
- START zone sends CHARACTER_SELECT + READY via transport, waits for remote READY before countdown
- `resolveStuckPlayer()` failsafe catches desync-related geometry embedding (>5px overlap → eject to nearest surface)

## React Strict Mode + Effects
- React dev mode double-invokes effects: mount → unmount → mount. If setup and cleanup are in SEPARATE `useEffect([], [])` calls, cleanup destroys the transport on first unmount, but the setup ref guard (`startedRef`) stays `true` so the second mount skips recreation → transport is dead.
- **Fix**: merge setup + cleanup into ONE `useEffect` with matched return. Strict Mode re-invocation then properly tears down and recreates.
- Never use a `startedRef` guard in effects that need to survive Strict Mode — the ref persists across the unmount/remount cycle.
- Read store state inside the effect body via `useGameStore.getState()` instead of capturing from render closure — avoids stale values when Strict Mode re-runs the effect.

## Determinism Desync Sources
- `assignBotCharacters` used `Math.random()` for shuffle — each peer got different bot characters → different AI personalities → instant desync. Fixed with optional seed parameter.
- AI personalities (per-character aggressiveness/cautiousness) amplified desync: different character assignments → different bot behavior. Disabled — all bots use neutral DEFAULT_PERSONALITY.
- `InputManager.getInput('P1')` only reads WASD. Online play needs `getInputAny()` that merges all 5 key bindings.
- Any function using `Math.random()` that affects game state must use `gameRandom()` or accept a seed. Grep for `Math.random` in engine/ and classify each call.

## Host-Authoritative State Sync
- Every 60 frames, host sends full `GameSnapshot` via DESYNC_CHECK message.
- Guest compares hash — if mismatch, applies host's snapshot to correct drift.
- This is a fallback safety net, not a replacement for deterministic simulation. Desyncs should still be investigated and fixed at the source.

## Transport Lifecycle
1. OnlineLobby creates Transport with lobby callbacks
2. `Transport.setEvents()` re-wires to match callbacks when NetMatch starts (critical — without this, rollback engine never receives input messages → game freezes)
3. On disconnect/quit: `transport.destroy()` + `resetOnline()`

## Match End / Victory / Rematch
- `onMatchEnd` only fires locally — host must send MATCH_RESULT to guest so both transition to victory screen. Without this, guest freezes after match ends.
- NetMatch stores `onMatchEnd` callback and handles incoming MATCH_RESULT by calling it with the guest's local state.
- Transport must survive across Match → VictoryScreen → Match cycle for rematch. Effect cleanup stops NetMatch but does NOT destroy transport. Transport destroyed only on explicit quit/menu.
- VictoryScreen "menu" button must `transport.destroy()` + `resetOnline()`.

## Online Pause / Victory Role Separation
- Pause menu differs by role: host gets Resume/Change Level/Cancel Game; guest gets Resume/Leave Game.
- Victory screen: only host sees Rematch and Change Arena. Guest only sees Leave Game.
- Game doesn't actually pause in online mode — ESC just shows the overlay while the game continues.

## Testing
- Unit tests cover PRNG determinism, protocol encode/decode, CRC32 — 21 tests in `net.test.ts`
- PeerJS can't be tested in Node (needs WebRTC) — use `public/nettest.html` for browser smoke test
- Protocol-level tests prove no message loops (HANDSHAKE no-echo, CHARACTER_SELECT no-cascade)
