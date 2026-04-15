# Guest Experience Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the guest's game experience match the host's — sound effects, particles, visual effects, ambient cosmetics.

**Architecture:** Add a `tickCosmetics(dt)` method to GameLoop for weather/particles/gibs/confetti simulation. Add a `GuestSFX` module that detects state transitions between snapshots and triggers sounds + particles. Add missing visual fields to snapshot format. Reduce interpolation allocations.

**Tech Stack:** TypeScript, existing audio/particle/renderer systems

---

### Task 1: Add `tickCosmetics(dt)` to GameLoop

**Files:**
- Modify: `src/engine/gameLoop.ts` — add public `tickCosmetics(dt)` method
- Modify: `src/engine/net/netMatch.ts` — call it in guest loop

Add a method that ticks cosmetic-only systems: weather, particles, gibs, confetti. Guest loop calls this each frame.

- [ ] **Step 1:** Add `tickCosmetics(dt)` to GameLoop after `renderFrame()`:
  - Calls `updateWeather(dt)`, `updateParticles(dt)`, `updateGibs(dt)`, `updateConfetti(dt)`
  - These are already private methods — just needs a public entry point
- [ ] **Step 2:** In `startGuestLoop()` in netMatch.ts, call `this.gameLoop.tickCosmetics(dt)` before `renderFrame()`
- [ ] **Step 3:** Verify weather/particles render on guest

### Task 2: Guest SFX — detect snapshot transitions and trigger sounds

**Files:**
- Create: `src/engine/net/guestSfx.ts` — state transition detector
- Modify: `src/engine/net/netMatch.ts` — wire up GuestSFX in guest loop

Track previous snapshot player states. On each new snapshot, compare and trigger:
- Player state `!== 'splat'` → `'splat'`: play `stomp` + animal sound
- Player `'airborne'` → `'idle'`/`'run'`: play `land`
- Player `'idle'`/`'run'` → `'airborne'`: play `jump`
- Spring `bounceTimer` went from 0 to >0: play `spring`
- Carrot `active` → `!active`: play `crunch`
- Thorn `hit` became true: play `thornhit`
- Countdown transitions: play `countdown_beep`/`countdown_go`
- Match over: play `victory`

- [ ] **Step 1:** Create `GuestSFX` class with `update(state, prevState)` 
- [ ] **Step 2:** Track previous state snapshot in guest loop, call detector after applying snapshot
- [ ] **Step 3:** Test SFX triggers on guest

### Task 3: Guest particles — emit from state transitions

**Files:**
- Modify: `src/engine/gameLoop.ts` — make particle spawners accessible
- Modify: `src/engine/net/guestSfx.ts` — add particle emission to event detection

On state transitions detected by GuestSFX, also emit particles:
- Stomp: spawn blood/confetti particles + gibs
- Landing: spawn dust
- Carrot pickup: spawn golden burst
- Spring bounce: spawn spring particles

- [ ] **Step 1:** Make `emitParticle()` and key spawner methods public on GameLoop
- [ ] **Step 2:** Call spawners from GuestSFX transition handlers
- [ ] **Step 3:** Verify particles render on guest

### Task 4: Add sideSquash + damageFlash to snapshot format

**Files:**
- Modify: `src/engine/net/snapshot.ts` — add 3 fields to encode/decode/take
- Modify: `src/engine/net/interpolation.ts` — sync new fields in applySnapshotToState

- [ ] **Step 1:** Add `sideSquash` (float32), `damageFlashTimer` (uint8), `damageFlashSide` (packed bit) to snapshot
- [ ] **Step 2:** Apply them in `applySnapshotToState()`
- [ ] **Step 3:** Verify wall-push squash and hit flash render on guest

### Task 5: Reduce interpolation allocations

**Files:**
- Modify: `src/engine/net/interpolation.ts` — reuse objects in `interpolateSnapshots()`

- [ ] **Step 1:** Pre-allocate a reusable `AuthSnapshot` result object
- [ ] **Step 2:** Mutate in-place instead of creating new objects via `.map()`
- [ ] **Step 3:** Reuse the aById Map in `interpolateSnapshots()`

### Task 6: Commit and push

- [ ] **Step 1:** Run `npx tsc -b` and `npx vitest run`
- [ ] **Step 2:** Commit all changes
- [ ] **Step 3:** Push
