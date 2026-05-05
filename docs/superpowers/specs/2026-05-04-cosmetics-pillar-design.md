# Cosmetics Pillar — Life, Motion & Reactive Environment

**Date:** 2026-05-04
**Branch:** `feat/cosmetics-pillar`
**Scope:** Phase 3 B-pillar work from arena-visuals (life & motion / reactive environment), plus richer existing particles, two new HUD systems, and variants of current cosmetics. 18 effects total, shipped in 5 batches.

## Motivation

Arena-visuals Phase 1 landed 3D platforms; Phase 2 (10 arena materials) is staged. The deferred B-pillar — motion, reactive environment, and visual polish — is what's left to complete the visual pass. Current cosmetics systems already cover stomp particles, kill VFX, weather, wildlife, fog, fireworks, afterimages, and footstep dust. What's missing is *responsiveness*: the world doesn't move when players move, surfaces don't react to impacts, and feedback for kills/scores is text-only.

This spec covers 18 effects that close those gaps without changing gameplay.

## Effect catalog

All 18 picks from the visual brainstorm. Visual designs locked via animated previews; implementation behavior summarized below.

| # | Effect | Trigger | System fit |
|---|---|---|---|
| 1 | **sway-wind** | continuous | new FoliageSystem (cosmetic) |
| 2 | **sway-react** | player position | new FoliageSystem |
| 3 | **sway-shake** | stomp transition | new FoliageSystem |
| 4 | **sway-burst** | shake threshold | new FoliageSystem (emits via ParticleSystem) |
| 5 | **env-ripples** | liquid-surface impact | new SurfaceImpactSystem |
| 6 | **env-cracks** | hard stomp on ice/glass | new SurfaceImpactSystem |
| 7 | **env-sparks** | per-tick footstep on tagged surface | extends PlayerCosmeticSystem |
| 8 | **env-decals** | hard-landing transition | extends PlayerCosmeticSystem (writes to bg layer) |
| 9 | **env-wakes** | underwater player movement | extends EnvironmentSystem |
| 10 | **env-pigeon** | stomp/impact near wildlife | extends EnvironmentSystem |
| 11 | **rich-spring** | spring bounce transition | extends ParticleSystem |
| 12 | **rich-thorn** | thorn hit transition | extends ParticleSystem |
| 13 | **rich-fastfall** | fast-falling state | extends Renderer drawPlayer (post-cache) |
| 14 | **rich-afterimage** | afterimage spawn | extends PlayerCosmeticSystem |
| 15 | **new-combo** | rapid kill chain | new HUDFeedbackSystem |
| 16 | **new-goalpulse** | score change | new HUDFeedbackSystem |
| 17 | **var-shockwave** | shockwave with surface tag | extends ParticleSystem (shockwave variants) |
| 18 | **var-dust** | per-tick footstep tempo | extends PlayerCosmeticSystem (replaces flat-tempo dust) |

## Architecture

### Existing systems extended

- **ParticleSystem** — new emitters for spring coil, thorn barb fragments, surface-aware shockwave variants. No data-shape change to particles; richer emit logic only.
- **PlayerCosmeticSystem** — surface-aware footstep VFX, stride-tempo dust, hard-landing scuff decal trigger, color-shift afterimage emit.
- **EnvironmentSystem** — bubble wakes (underwater-only), wildlife reactions to stomps (extends existing wildlife/pigeon code).

### New systems

#### `FoliageSystem` (`gameLoop/cosmetics/FoliageSystem.ts`)

Implements `CosmeticSystem` interface. Owns:
- Per-arena `foliageInstances: FoliageInstance[]` registered by arena packs
- Global `windPhase: number` advanced by `cosmeticStep` dt
- Per-instance reactive offsets driven by player positions (parting) and stomp events (shake)

Each `FoliageInstance` carries a position, kind (`'tree' | 'tall_grass' | 'fern' | 'bush' | 'sapling'`), seed, plus a tiny per-instance state struct (`reactDx: number`, `shakeDecay: number`).

Render path: arena pack's `drawForegroundNature` no longer draws swayable elements. Instead, the renderer iterates `foliageInstances` between the cached fg-nature blit and the player layer, calling shared draw primitives (`drawSwayingTree`, `drawSwayingGrass`, `drawSwayingFern`, etc.) with the instance's current sway+react state.

**Cache implication:** Today's `_fgNatureCache` stays in place for static foreground (decorative rocks, mushrooms, distant flowers). Anything that sways moves out of `drawForegroundNature` and into the foliage instance list. This is the key migration cost for Batch A — every arena pack with swayable foliage must split its draw function.

`sway-burst` (petal flurry) emits via `particleSystem.emitParticle` when `shakeDecay` crosses a threshold, so the particles ride the existing pool and Renderer extrapolation.

#### `SurfaceImpactSystem` (`gameLoop/cosmetics/SurfaceImpactSystem.ts`)

Implements `CosmeticSystem`. Subscribes to two transition signals:
- Stomp landing (already detected by `PlayerTransitionSystem`)
- Liquid-zone entry from `state.players[i]` crossing into a hazard zone tagged `liquid` (lava/water — uses existing hazard-zone metadata)

For each impact, looks up the surface tag (Platform.surface or hazard zone surface), and dispatches:
- `surface: 'water' | 'lava'` → ripple emitter (3 expanding rings, ~0.6s lifetime)
- `surface: 'ice'` → spider-crack overlay drawn into bg cache (radial cracks, ~3s fade)
- `surface: 'glass'` → spider-crack overlay (lighter, ~2s fade)
- All surfaces → standard shockwave variant from `var-shockwave` table

Cracks/scuffs render into the bg cache layer like splat marks (uses existing `splatMarks` plumbing pattern: spawn in cosmeticStep, render with fade-only redraw, expire when `decay <= 0`). New `surfaceDecals: SurfaceDecal[]` array on `MatchState`.

#### `HUDFeedbackSystem` (`gameLoop/cosmetics/HUDFeedbackSystem.ts`)

Implements `CosmeticSystem`. Owns:
- `comboBuffer: { slot: PlayerSlot, killTimes: number[] }[]` — rolling kill timestamps per slot, window = 1.5s
- Active popup queue: `{ x, y, count, age }[]` (max ~6 active)
- Score-change tracker: `prevScores: Map<PlayerSlot, number>`

Trigger logic:
- Combo popup: when a kill is appended to `state.killFeed` and the killer's window has 2+ kills → enqueue popup tagged with `count` (×2/×3/×4...). Position = victim's death location.
- Goal pulse: rising edge of `state.players[i].score` → mark `pulseTime = now` for that slot's HUD pill.

Render: combo popups draw as standalone canvas text in the foreground layer (post-player, pre-HUD). Goal pulse rendered inside the existing HUD cache draw with a scaled+flashed pill.

### Surface tagging

Add to `Platform`: `surface?: 'grass' | 'stone' | 'metal' | 'snow' | 'sand' | 'ice' | 'wood' | 'glass'` (defaults to `'grass'` if unset). Used by:
- `var-dust` / `env-sparks` — picks footstep VFX per tag
- `env-decals` — surface determines decal style (dirt scuff, scorch, wet print)
- `var-shockwave` — picks shockwave variant per tag

Hazard zones with liquid surfaces (lava, water) already carry their kind via `HazardZone.kind`. Reused — no new tagging there. Underwater bubble wakes are arena-conditional (only `underwater` arena), not surface-tagged.

## Per-batch design

### Batch C — Player VFX polish (4 effects, ship first)

Lowest-risk batch. No new systems, no arena-pack changes.

- **rich-spring (coil afterimage):** When `springTrailTimer` rises edge-detected, emit a `spring_coil` particle at the spring's apex with curlicue-arc render style. New particle subtype rendered in `rendering/particles.ts` via existing extrapolation.
- **rich-thorn (barb fragments):** When `slowTimer` rises edge from a thorn (already tracked via `applyHazardHitVFX`), emit ~8 sharp barb-shaped particles + a slow drip particle at contact point. Adds 2 new particle subtypes.
- **rich-fastfall (chromatic streaks):** Replace existing fast-fall lines in `drawPlayer` (post-cache) with three offset streak passes (cyan, magenta, red shadow) at ~0.55 alpha. No new system; 5-line change in `rendering/players.ts`.
- **rich-afterimage (color-shift ghost):** PlayerCosmeticSystem already emits afterimages with alpha fade. Add hue-shift toward `pack.color` in the `drawAfterimage` call (existing primitive); store afterimage tint per-emit.

Tests: extend `particleSystem.test.ts` with new subtypes; extend `players.test.ts` for chromatic-streak draw call counts.

### Batch B — Surface impact + footsteps (5 effects)

Adds `Platform.surface` tagging across all 11 arenas + ground surfaces. Adds SurfaceImpactSystem.

Migration tasks:
1. **Add `Platform.surface` field** to `engine/types.ts` with default fallback to `'grass'`.
2. **Tag every platform** in all 11 arena packs. Most are obvious (meadow=grass, castle=stone, candy=cake [maps to 'wood' for footstep purposes], spaceStation=metal, winterLake=ice/snow mixed, underwater=stone with water hazard zones, etc.).
3. **Implement SurfaceImpactSystem** with crack/ripple decal lifecycle.
4. **Extend PlayerCosmeticSystem footstepAccumulator** to read surface and dispatch correct VFX (sparks/snow/sand/dust), and to scale puff size/tempo with current `|vx|` (var-dust).
5. **Hard-landing scuff decal:** Detect via existing fast-fall transition + landing event. Spawn a `surfaceDecal` with character-color tinted scorch shape; lifetime ~5s, fade-only redraw.

Tests: arena-pack surface tag coverage; surface dispatch routing; ripple/crack lifecycle.

### Batch A — Foliage system (4 effects)

Largest batch. Touches every arena pack with foliage.

Migration tasks:
1. **Define `FoliageInstance` interface** + per-arena `foliageInstances: FoliageInstance[]` field on `ArenaPack`.
2. **Build FoliageSystem** with cosmeticStep tick (advance windPhase, decay shakeDecay, compute reactDx from nearest player).
3. **Per-arena migration** — split each arena's `drawForegroundNature` into static + swayable. Static stays cached; swayable moves to `foliageInstances`. Affected arenas: meadow, treetops, waterfall, underwater, hauntedGraveyard, possibly winterLake (pines), candy (lollipop trees). Castle, rooftops, spaceStation may have nothing to migrate.
4. **Renderer integration** — iterate foliageInstances after fg-nature cache blit, before player layer.
5. **Sway primitives** in `themes/drawPrimitives/sway.ts`: `drawSwayingTree`, `drawSwayingGrass`, `drawSwayingFern`, `drawSwayingBush`, `drawSwayingSapling`. Each takes `(ctx, instance, swayState, palette)`.
6. **Reactive parting** — `FoliageSystem.update` queries player positions; for each tall-grass/fern instance within 24px of a player, computes `reactDx = sign(grassX - playerX) * (1 - dist/24) * 14`, snaps back when player leaves. Smoothed via lerp toward target with ~10 frames ease-out.
7. **Stomp shake** — On stomp transition (PlayerTransitionSystem signal), find all tree/sapling instances within radius (~80px) and set `shakeDecay = 1.0`. Decays at `dt * 7`.
8. **Petal burst** — When `shakeDecay > 0.95` (just-set edge), if instance.kind allows petals (sapling, treetops cherries), emit ~8-14 petal particles via ParticleSystem. New `petal` particle subtype with rotation.

Tests: foliage state derivation (windPhase, reactDx lerp), stomp-shake propagation, sway primitive draw call counts.

### Batch E — HUD & feedback (2 effects)

Self-contained.

- **new-combo (×2 ×3 ×4 popups):** HUDFeedbackSystem combo detector with 1.5s window. Popup format **`×N`** style (locked). Color ramp: `×2` yellow, `×3` orange, `×4+` pink. Rises ~30px over 0.6s, fades final 0.4s.
- **new-goalpulse:** Pulse + flash on score-change rising edge. Goes inside HUD cache draw (`rendering/hud.ts`); HUD cache invalidates per-frame on active pulse — fine, pulse window is <0.5s.

Tests: combo window detection (single kill = no popup, 2 within 1.5s = ×2, 3 within 1.5s = ×3, kills outside window reset count); pulse trigger on score change.

### Batch D — Reactive ambient (2 effects)

Arena-conditional.

- **env-wakes (bubble trails):** Extends EnvironmentSystem with underwater-only wake emitter. When `arenaId === 'underwater'`, spawn small bubble particles behind moving players (gated by `|vx| > 50`). Bubbles rise via existing particle physics with negative gravity.
- **env-pigeon (wildlife reactions):** Extends existing wildlife rendering in EnvironmentSystem. Wildlife already has positions; add a `scared` state that triggers on stomp transitions within radius (~120px). Scared birds fly off-screen with velocity, return after ~3s. Reuses existing wildlife sprite paths with `scared` overlay (wing flap intensity, vy upward).

Tests: underwater-only wake guard; wildlife scared-state trigger + recovery.

## Gating

Slow-device gating uses existing `getSlowDevice()` from `perfFlags.ts`. New systems gate as follows:

| Effect | Slow-device | Gore-mode | Notes |
|---|---|---|---|
| sway-wind, sway-react, sway-shake, sway-burst | gated off | unaffected | FoliageSystem still iterates instances and draws them, but skips wind/react/shake math — instances render static. No fallback to cached fg-nature (those instances were moved out for Batch A); they just don't move. |
| env-sparks (surface footsteps), var-dust | always on | unaffected | Replaces existing flat-tempo dust; never visually heavier than today |
| env-decals (scuffs) | always on | unaffected | Bg cache decals; cheap |
| env-ripples, env-cracks, var-shockwave | gated off | unaffected | SurfaceImpactSystem early-returns; std stomp particles still play |
| env-wakes, env-pigeon | gated off | unaffected | EnvironmentSystem already gates ambient particles on slow-device |
| rich-spring | always on | unaffected | Pure ParticleSystem upgrade, no extra cost |
| rich-thorn | always on | **red kept regardless** | User explicitly opted to keep red barb fragments without a gore-off variant |
| rich-fastfall (chromatic streaks) | gated off | unaffected | drawPlayer renders flat-color streaks when slow-device on |
| rich-afterimage (color-shift) | gated off | unaffected | Falls back to current alpha-only afterimage |
| new-combo, new-goalpulse | always on | unaffected | Gameplay feedback; never gated |

Auto slow-device promotion (sustained-low-fps detection in GameLoop) flips `_auto = true`, which propagates via `subscribeSlowDevice`. New systems read `getSlowDevice()` per frame (cheap getter).

## Performance budget

Hard targets:
- **Slow-device on:** zero net frame-time regression. Gated systems early-return inside `update()` and contribute no draw calls.
- **Slow-device off, reference desktop:** ≤1ms additional render time across all batches at peak load (5 players, all foliage active, mid-stomp surface decals).

Approach:
- Foliage sway uses `fastSin` from `fastMath.ts` (already in hot-path budget).
- Foliage instance count capped at ~50 per arena. Reactive parting query is O(N foliage × M players) ≤ 250 ops/cosmeticStep tick, negligible.
- Surface decals use the existing `splatMarks` cache pattern (bg layer, fade-only redraw).
- Particle pool stays at 600 cap. New emitter shapes share the pool — total particle count doesn't increase, just visual variety.
- HUDFeedbackSystem combo detection is O(killFeed.length) per tick, killFeed already capped.

cosmeticStep half-rate (30Hz) timing applies to all new systems. Reactive parting offsets are smoothed at 30Hz; user-perceived motion is interpolated by Renderer's existing extrapolation pipeline (where applicable to particles).

## Network play

All cosmetics run via `cosmeticStep` on host AND guest. Each system's triggers map to data already in snapshots:

- Foliage sway: pure cosmetic, runs locally on each peer. windPhase is local-only — minor cosmetic divergence acceptable (same pattern as idle actions).
- Reactive parting: uses interpolated player positions from snapshots. Works on guest.
- Stomp shake: stomp transitions already detected on guest via cosmeticStep prev-state comparison.
- Surface decals: stomp transitions + landing transitions detected on both sides. Decals are local-only — guests don't desync if they spawn slightly different decal jitter (seeded by stomp position + frame).
- Combo popups: kill detection already on both sides via `state.killFeed`. Popups are local visual.
- Goal pulse: score field already snapshotted; rising-edge detection works on guest.
- Env-wakes / env-pigeon: ride existing EnvironmentSystem cosmetic-step flow.

**No protocol/wire-format changes. PROTOCOL_VERSION stays at 12.**

Surface decals on bg cache layer: when `Renderer.setRenderScale()` invalidates the cache (rare event), surface decals are lost. Same as splat marks today. Acceptable.

## Test strategy

- **Unit:** Per-system pure-function tests in `gameLoop/cosmetics/__tests__/`. FoliageSystem state derivation, SurfaceImpactSystem dispatch routing, HUDFeedbackSystem combo detection, surface footstep VFX selection.
- **Smoke:** Per-arena foliage migration smoke tests (does each arena render without errors at multiple time slices?). Reuse arena-pack test pattern from `arenas/packs/__tests__/`.
- **Slow-device regression:** Extend perf e2e profile (`npm run perf -- --arena=meadow`) to assert frame-time stays within budget when all batches are on.
- **E2E:** Combo popup appears on rapid double-kill (use carrotChase mod for fast scoring). Goal pulse triggers on carrot pickup.
- **Determinism:** Sims must remain deterministic — new cosmetic systems are excluded from determinism tests by living entirely in cosmeticStep (already excluded from regression snapshots).

## Ship order

Confirmed: **C → B → A → E → D**.

1. **Batch C** — Player VFX polish. Lowest risk; ParticleSystem emitter upgrades + drawPlayer tweaks.
2. **Batch B** — Surface impact. Adds `Platform.surface` tagging + SurfaceImpactSystem. Touches every arena pack but trivially (one-line tag per platform).
3. **Batch A** — Foliage. Largest. Adds FoliageSystem; per-arena migration of swayable foliage out of cached fg-nature.
4. **Batch E** — HUD & feedback. Self-contained. Adds HUDFeedbackSystem.
5. **Batch D** — Reactive ambient. Arena-conditional, smallest scope.

Each batch ships as its own PR-ready commit chain on `feat/cosmetics-pillar`. After Batch C lands cleanly, Batch B work begins. Worktree stays alive through all 5 batches; main rebase or merge at each batch boundary if user prefers landing incrementally.

## Open questions / followups

- **Combo window** defaulted to **1.5s**. Tune in playtest.
- **Per-arena foliage migration list** — exact instance positions need authoring per-arena alongside Batch A (treat as part of that batch's work).
- **Wildlife `scared` reaction** — current EnvironmentSystem wildlife list scope (which arenas have what wildlife). Verify before Batch D; some arenas may have none.
- **Tagging glass surfaces** — only spaceStation has glass-like platforms (?). Confirm during Batch B walkthrough; default to ice if no glass arena exists.
- **Decal cap** — surface decals + splat marks compete for bg-cache "writes since render" tracking. Add separate cap (~30 active surface decals) to prevent runaway accumulation in long matches.
