# Worker offload brainstorm prep — open questions

**Date:** 2026-05-08
**Status:** Pre-brainstorm. Read before starting the worker-offload design session.
**Source:** Carried over from L2 close-out conversation. Triggered by perf projection: castle 6.3ms now + L3/L4/L5 estimated 4-8ms = budget pressure on the worst arena.
**Owner:** Separate session. **Do not start L3 in the same worktree** — this work touches the renderer/sim wiring at a level that conflicts with arbitrary L3 edits.

## Why this exists

The lighting program ships ~3 more pillars after L2 (sun shadows, bloom/post-processing, atmosphere). Combined estimate eats most of the 10ms headroom we currently have on castle. Moving simulation + rendering into a Web Worker via `transferControlToOffscreen` banks ~5ms of main-thread budget *before* that load lands. Doing it after we've shipped L3-L5 would be a debugging-against-a-deadline rewrite; doing it now is a clean refactor against a green test suite.

The codebase is already unusually well-shaped for this:
- `Simulator` is browser-pure. Verified by `regression-no-browser-apis.test.ts`.
- `HeadlessRunner` already drives Simulator from Node. Worker is a third runtime, same shape.
- Snapshot codec (`net/snapshot.ts`) already encodes state to binary `Uint8Array` for network transfer. Same bytes can flow through `postMessage`/`Transferable`.
- Side effects already flow through `SimulatorEvents` + `ParticleEmitter` — exactly the boundary a worker needs.

## Recommended architecture (working assumption — open to revisit)

**One worker holding sim + render + cosmetics.** Not two workers. Reasons:
- Particles cross the sim/render boundary at high frequency (100+/s on castle). Two-worker split forces a `postMessage` per emit or a SharedArrayBuffer.
- SharedArrayBuffer requires COOP/COEP headers on the host page. **GitHub Pages cannot set custom headers.** That hard-disables two-worker Arch C for our deployment.
- Sim is cheap (~1ms). Pulling it into the same worker as render is essentially free additional move; no reason to keep it on main and pay an extra postMessage hop per tick.

```
Main thread:                          Worker:
  React (menus, modals, victory)        Simulator (state + systems)
  KeyboardManager (window listeners)    Renderer (Canvas 2D draw calls)
  TouchInputManager                     ParticleSystem + 4 cosmetic systems
  AudioManager (Howler)                 RAF loop (workers can call rAF)
  WebRTC transport (Trystero/MQTT)      OffscreenCanvas refs (transferred)
  DOM HUD overlays                      
  Debug bridge (state mirror)           
                                        
  ↓ postMessage events ↓                
   • input batches per frame            
   • lifecycle (start/stop/pause)       
   • network snapshots from peers       
                                        
  ↑ postMessage events ↑                
   • SFX requests                       
   • haptic requests                    
   • match-end / phase-change           
   • snapshots out (host) / debug state 
   • victory data                       
```

This is "Arch C collapsed to one worker" from the conversation.

---

## Open questions (read before deciding)

### 1. Canvas count and transfer strategy

Today there are multiple sibling canvases:
- `bgCanvas` (background, includes splat marks, redrawn on splat)
- `fgCanvas` (foreground, every frame — players, particles, HUD)
- `bgNightCanvas` (L1 cross-fade sibling, `mix-blend-mode: multiply`)
- `lightCanvas` (L2 emitters, `mix-blend-mode: screen`)
- L3 will likely add `shadowCanvas` (`mix-blend-mode: multiply`)

Two strategies:

- **(a) Transfer each canvas to the worker.** `transferControlToOffscreen` per canvas, worker holds N OffscreenCanvases, draws into each. CSS compositor still composites them on the main thread via `mix-blend-mode`. Same DOM topology as today.
- **(b) Composite in-worker, ship one canvas to main.** Worker maintains all the offscreens internally, blends them into a single output OffscreenCanvas, transfers that one canvas to the main DOM. Loses the CSS compositor (which is GPU-cheap) but consolidates everything to one DOM node.

**Recommendation: (a).** Preserves the L1+L2 compositor architecture (DOM siblings + `mix-blend-mode` + `bgNightOpacity`-driven opacity). The browser's GPU compositor is doing real work for free; throwing it away to merge canvases on the CPU in-worker is a regression. (a) is also a smaller refactor — each canvas is independent, fewer integration points.

### 2. Where does RAF live?

OffscreenCanvas-bearing workers can call `requestAnimationFrame`. Two options:
- **(a) Worker drives its own RAF loop.** Tightest possible main-thread isolation. Worker tick rate is independent of main thread.
- **(b) Main calls RAF, posts "tick" message to worker.** Worker is reactive. Slower (one postMessage round-trip per frame), but easier to pause/resume from React lifecycle.

**Recommendation: (a).** Lower latency, less main-thread chatter. Match.tsx tells the worker "start" / "stop" / "pause"; worker handles the frame cadence.

### 3. Input forwarding cadence

KeyboardManager owns `window` keydown/keyup listeners (must stay on main thread). Currently `Simulator` reads pressed-key state synchronously each tick.

- **(a) Post InputState batch per frame.** Main thread builds the per-slot InputState[] from pressed-keys, posts to worker once per frame. Worker reads it during its tick.
- **(b) Post key events as they fire.** Each keydown/keyup is a postMessage. Worker maintains its own pressed-keys mirror.

**Recommendation: (a).** Coarser, fewer messages, sub-frame latency only matters for input-to-sim which is sub-frame already. Negligible difference perceptually; (a) is a cleaner contract (matches `PlayerInput.getAction(state)` shape).

**Open question:** is per-frame postMessage from main → worker cheap enough? Modern Chromium: yes, sub-100µs for small structured-clone payloads. Worth confirming with a perf probe early in implementation.

### 4. SimulatorEvents → main thread

Sim emits events for SFX, music, phase change, match end, haptic. Currently delivered via callbacks held by GameLoop. With sim in worker:

- Worker collects events during the tick into a small buffer (or just per-event).
- Posts an event message to main thread per event (or batched per tick).
- Main's AudioManager/HapticManager listens and dispatches.

**Open question:** batching strategy. Per-event postMessage is simpler but ~10-30 messages per tick on busy frames (e.g. multi-stomp + landing + crowd cheer). Per-tick batching is one message but adds up to 16ms latency on the audio side. Audio latency is already 10-30ms (browser pipeline) — an extra 16ms is borderline perceptual on tight stomp-thuds. **Defer the decision until we measure with a real frame.**

### 5. Network transport — host vs guest

Host's sim runs in worker. WebRTC datachannel lives on main (transport.ts owns Trystero handles). Snapshot flow:

- Worker sim ticks → produces snapshot → posts ArrayBuffer to main → main calls `transport.sendUnreliable(snapshot)`. One postMessage per broadcast.
- Guest receives snapshot on main → posts to worker → worker applies via `applySnapshotToState`. One postMessage per inbound snapshot.

**Open question:** does this satisfy the host loop's "input fairness delay" timing? `HostAuthority` buffers own inputs by RTT/2 frames to match guest latency. The buffer can live in the worker — RTT is measured on main and posted to worker on change. Should work, but the input-buffering integration is the most subtle part of the netcode and needs careful re-wiring.

**Recommendation:** prove single-player worker first, add networking second. Don't try to debug both at once.

### 6. Debug bridge / E2E observability

Currently:
- `window.__gameLoop.getState()` — sync, used by E2E tests and debug overlays.
- `?debug=net` reads `__netMatch.getStats()` — sync.
- `?debug=nav` reads state during render — sync (`navDebugOverlay`).

Worker breaks all of these.

**Options:**
- **(a) State mirror on main.** Worker posts a compact state digest to main every tick (or every N ticks). Main exposes `window.__gameLoop.getState()` from the mirror. ~1 frame stale.
- **(b) Async getter.** `window.__gameLoop.getState()` becomes async. E2E tests refactor: `await window.__gameLoop.getState()`.
- **(c) SharedArrayBuffer for state.** Sync read on main. Requires COOP/COEP — same blocker as the two-worker case. **Hard no for GitHub Pages.**

**Recommendation:** (a) for production paths (E2E waits, debug overlays, victory data). The state digest is a Float32Array of ~20 fields that fit in a transferable buffer. Cheap. Refactor E2E to read from the mirror via `waitForFunction`.

### 7. Headless runner relationship

`HeadlessRunner` is what already proves the architecture works. The worker should **not** be a separate runtime parallel to it — both use the same Simulator + system code.

- **Worker** = browser host of Simulator + Renderer (+ ParticleSystem, cosmetic systems)
- **HeadlessRunner** = Node host of Simulator only (no Renderer, no cosmetics)

The worker is a third deployment of Simulator. Test invariants: anything that runs in HeadlessRunner must continue to run in worker. Same imports, same module graph, just hosted differently.

**Open question:** does the worker pull in any modules HeadlessRunner doesn't? Renderer + ParticleSystem + cosmetic systems do touch DOM/canvas — they're worker-safe (OffscreenCanvas exists in workers) but aren't Node-safe. That's fine; the worker bundle is browser-only. No regression-test impact, but the worker bundle target needs to be configured separately in Vite.

### 8. Vite worker config

Vite supports workers via `new Worker(new URL('./path', import.meta.url), { type: 'module' })`. Module workers are well-supported. Two questions:
- **HMR**: Vite worker HMR is fiddly. Known DX cost.
- **Build output**: workers are emitted as separate chunks; need to verify the worker bundle isn't double-counting Howler/i18next/React (it shouldn't import any of those).

**Recommendation:** structure the worker as a thin entry that imports `Simulator`, `Renderer`, `ParticleSystem`, cosmetic systems. NO React, NO Howler, NO Trystero, NO i18next imports in the worker module graph. Add a regression test: `worker-bundle-no-main-deps.test.ts` that resolves the worker entry's transitive imports and asserts the forbidden modules are absent.

### 9. Worker startup and arena switching

Today's lifecycle:
- Match.tsx mounts → constructs GameLoop → GameLoop calls `simulator.start()` and starts RAF.
- Arena switch: `gameLoop.switchArena(id)` resets state, swaps Renderer's arena, restarts.

Worker version:
- Match.tsx mounts → constructs the Worker → posts canvas refs (transferControlToOffscreen) + initial config → worker sets up Simulator + Renderer.
- Arena switch: post `{type: 'switchArena', id}` to worker. Worker handles internally.

**Open question:** resource handoff for assets. MP3 music stays on main thread (Howler). Canvas-only assets (sprite caches built procedurally inside Renderer) stay in-worker since they're built from primitives. Image assets (logos, backgrounds if any) — currently all procedural except `logo.png` which is React-only. Should be clean. **Verify no `Image()` or `<img>` references inside `engine/rendering/`.**

### 10. Mobile / touch

`TouchInputManager` lives on main thread (DOM touch events). Forwards InputState batches same as keyboard. The mobile-specific UI overlays (jump button, dpad) stay React on main. No sim-side change needed; mobile input becomes another `PlayerInput` slot in the worker's Simulator.

### 11. CharacterSelect / lobby

`lobbyGame.ts` runs Simulator-equivalent logic for the JnB-style lobby. It's a thin custom orchestrator, not a full Simulator. Two options:
- Run lobby on main thread (no worker). Simpler. Lobby is much cheaper than match.
- Run lobby in worker too, share the worker entry.

**Recommendation:** lobby stays on main. Don't pay worker startup latency before the user has even picked an arena.

### 12. Pause overlay and React reactivity

Match.tsx shows a pause overlay (DOM, React-driven). When the worker pauses, main thread needs to know. When user clicks "resume" in React, worker needs to know.

This is just message-passing; not architecturally novel. Document it because it's the kind of plumbing that gets forgotten in the design and discovered painfully in QA.

### 13. Test strategy

Unit tests today mostly mock `Renderer` and run against `Simulator` directly. Those tests don't change.

New tests needed:
- **Worker bundle regression**: forbidden imports check (per #8).
- **Roundtrip integration**: worker startup, drive a match for N ticks via worker, assert state mirror matches direct-Simulator state. Effectively tests the postMessage protocol.
- **E2E refactor**: existing E2E tests using `window.__gameLoop.getState()` need to switch to the state mirror or to `await` getters.

CI cost: roundtrip tests are slow (worker startup overhead). Run them in a separate vitest project tier ("integration") so they don't slow down the unit test loop.

### 14. Rollback strategy

If the worker refactor lands and we hit production crashes / weird breakage we can't diagnose, we need a fast off-switch. Options:
- **URL flag**: `?worker=off` falls back to main-thread GameLoop. Keeps both code paths alive.
- **Build-time flag**: removes one path or the other. Smaller bundle, no fallback.

**Recommendation:** ship with URL flag for the first ~2 weeks after merge, then remove the main-thread path once worker has proven stable. The fallback path is what last-resort debugging looks like; without it, a bad bug means a hot revert.

---

## Sequencing (proposed, refine in brainstorm)

Each phase is a working, tested, mergeable increment. Don't try to land the whole refactor in one PR.

1. **Worker scaffold + canvas transfer.** Worker entry, transferControlToOffscreen for bgCanvas + fgCanvas, simplest possible "draw a colored rect" round-trip. Proves Vite config + canvas transfer + RAF-in-worker.
2. **Move Renderer to worker.** Worker holds Renderer; main posts state snapshots per frame. Sim still on main. Validates Renderer is worker-safe and identifies any DOM-API leaks (Image, Font, etc.). Proves the "worker can render" claim with the largest piece of code.
3. **Move Simulator to worker.** Sim now lives next to Renderer in worker. Main posts InputState batches per frame. SimulatorEvents post back to main. Proves the full single-player worker path.
4. **Add bgNightCanvas + lightCanvas to the transfer set.** L1+L2 layers move to worker. Proves the multi-canvas + `mix-blend-mode` topology survives.
5. **Networking integration.** Host sim in worker broadcasts; guest sim in worker applies snapshots. Proves the trickiest external integration.
6. **Debug bridge + E2E refactor.** State mirror, async getters, E2E test conversion.
7. **Cleanup + rollback removal.** Remove URL flag once stable.

**Estimate:** ~1.5–2 weeks elapsed for a focused session. L3 work paused during this window; resumes after step 4 or step 7 depending on appetite.

---

## Risks

- **DX regression** (HMR friction, split source maps, console.log goes to a different devtools pane). Real cost. Plan to spend half a day improving DX (vite config, source map handling) once the core refactor lands.
- **Audio latency variance** (#4). May need to fast-path stomp/jump SFX events with their own immediate-flush mechanism. Don't design this until measured.
- **Network input buffering** (#5). The host's input fairness delay is the only piece of netcode that's coupled to per-tick timing. Easiest to break, hardest to test. **Validate against `?simLatency=80&simJitter=20` early.**
- **State mirror staleness** for debug overlays. Nav debug + perf overlays may flicker at 1-frame stale; check if that's acceptable visually before declaring victory.
- **Hot reload during dev**. If HMR doesn't work for the worker entry, dev velocity drops. Reproduce early; if HMR can't be made to work, accept full reloads as the cost of the refactor.

---

## What this doc is NOT

- Not an implementation plan. The brainstorm session decides architecture; a separate plan doc lays out tasks.
- Not a perf measurement. The 5ms-banked figure comes from the post-L2 perf report (`perf-runs/post-l2/REPORT.md`) — drawImage 12.4% + addColorStop 2% + fill operations + cosmetic draw work. Worker doesn't make canvas work cheaper, just moves it off main. Real number is "how much main-thread time we recover," which is approximately the canvas work total.
- Not a commitment to do this before L3. **Decision to be made in brainstorm.** If brainstorm concludes the cost outweighs the benefit, file this doc as a "considered, deferred" record.

---

## Reading list before brainstorm

- `src/engine/simulator/Simulator.ts` — what runs in worker
- `src/engine/simulator/types.ts` — SimulatorEvents + ParticleEmitter contracts
- `src/engine/headless/HeadlessRunner.ts` — proves the sim is host-portable
- `src/engine/__tests__/regression-no-browser-apis.test.ts` — invariant the worker preserves
- `src/engine/gameLoop/GameLoop.ts` — the browser adapter we're replacing with a worker harness
- `src/engine/renderer.ts` + `src/engine/rendering/*` — what runs in worker as render path
- `src/engine/net/netMatch.ts` — host/guest loops; integration risk #5
- `src/components/Match.tsx` — canvas mount point; will own the worker handle
- `perf-runs/post-l2/REPORT.md` — the perf data justifying the move
- L3 brainstorm-prep doc (`2026-05-08-lighting-l3-brainstorm-prep.md`) — for awareness of the shadow-canvas addition that lands after this work
