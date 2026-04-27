# Rim Light (D5) — Status & Next Steps

**Branch:** `feat/rim-light` (worktree at `.worktrees/rim-light`)
**Status:** Prototype shelved 2026-04-27. Not merged. Branch retained for future polish.

## What works today

- Source-atop linear gradient overlay clipped to silhouette via `applyRimLight()` in `src/engine/rendering/players.ts`
- No edge artifacts (no offset stamping); gradient blends smoothly with body
- Sprite-cache integration: `rimKey` bit in cache key, `subscribeRimLight()` clears cache on toggle
- Toggle UX: `?rim=on` URL param + `R` key + localStorage persistence
- Test suite passes (only the known pre-existing flakes fail)

## Why we shelved it

In-game evaluation surfaced four real issues that share the same root cause:

> "too strong, ignores the moving sun, switched direction when characters turn left/right, also applied during night/moon phase"

All four trace back to: **rim is baked into the sprite cache**, so:
- It can't track the runtime `dayPhase` (sun position) without flushing the cache every frame
- It flips with the facing transform applied at blit time
- Disabling at night requires either flushing the cache twice a day or leaving stale night rim baked in
- Fine alpha tuning is fighting against the bake-once cache, not against current-frame conditions

Fundamentally the rim light *needs* to be a per-frame effect. Baking was the wrong architectural call.

## Known issues + fixes (priority order)

### 1. Move rim OUT of the sprite cache

**Required for everything else.** Render rim per-frame in `drawPlayer`, AFTER the facing flip is restored. Approach:

- Sprite cache stays canonical (no rim, no facing flip)
- Per-frame: take a small scratch OffscreenCanvas, blit the cached sprite to it (canonical orientation), apply gradient via `source-atop` in world-space direction, then blit scratch onto the main canvas at the player's world position WITHOUT the facing flip
- Per-character cost: 1 extra OffscreenCanvas allocation (or one shared scratch reused across players) + 2 drawImage calls + 1 fillRect. Affordable for ≤5 chars at 60fps.

**Effort:** Medium. Need to refactor `drawPlayer` to do the rim pass after the existing flip-aware blit. The scratch canvas can be a single module-scope canvas reused across all players.

### 2. Track world-space sun position

`themes/types.ts` has `DayNightConfig`. The render path computes `dayPhase` and `sunPhase = (dayPhase + 0.25) % 1` (0=sunrise, 0.5=sunset). Sun X moves from right horizon (sunrise) → top (noon) → left horizon (sunset).

**Light direction:** opposite of sun position. Convert `sunPhase` → angle:
- `sunPhase = 0` (sunrise, sun at right): rim on right side → gradient from right-to-left
- `sunPhase = 0.25` (noon): rim on top → gradient from top-to-bottom
- `sunPhase = 0.5` (sunset): rim on left → gradient from left-to-right

Map `sunPhase ∈ [0, 0.5]` to angle θ ∈ [-π/2, π/2] (right→up→left), then build gradient endpoints from cx + cos(θ)*r → cx - cos(θ)*r etc.

**Effort:** Small once #1 is done. Just compute angle from `theme.dayNight` + current `frameTime`.

### 3. Disable during night

`drawDayNightCycle` in `effects.ts` computes `nightIntensity = (1 - cos(dayPhase × 2π)) / 2`. When `nightIntensity > 0.5`, rim should be off (or flip to a moonlight-direction with much lower alpha — moonlight rim is a stretch goal).

**Simplest:** gate rim draw on `nightIntensity < 0.5` in the per-frame path. Once #1 lands, this is one `if`.

**Effort:** Trivial (~5 lines).

### 4. Theme-aware light color

Currently rim is always white. On warm-tinted skies (volcano, sunset), white rim looks wrong. Read sky's brightest gradient stop, or sample the sun glow color from `effects.ts` (gold during sunset).

**Effort:** Small. Cache the rim color per-theme alongside `themeLuminance` from the outline branch.

## Implementation sketch for next pass

```ts
// rendering/players.ts
const rimScratch: OffscreenCanvas | null = ...; // module-scope, lazy init

function drawPlayerWithRim(ctx, player, theme, frameTime, cachedSprite, dx, dy, dw, dh) {
  // ... existing facing-flipped sprite blit ...

  if (!getRimLight()) return;
  const dayPhase = computeDayPhase(theme, frameTime);
  const nightIntensity = (1 - Math.cos(dayPhase * Math.PI * 2)) / 2;
  if (nightIntensity > 0.5) return;

  const sunPhase = (dayPhase + 0.25) % 1;
  // Map [0, 0.5] → angle (right=0, up=π/2, left=π) — clamp into day half only
  const angle = sunPhase < 0.5 ? Math.PI * (1 - sunPhase * 2) : 0;
  const dx_ = Math.cos(angle), dy_ = -Math.sin(angle);

  // Render rim into scratch using cached sprite as silhouette
  const sctx = rimScratch.getContext('2d');
  sctx.clearRect(0, 0, scratch.width, scratch.height);
  sctx.drawImage(cachedSprite, 0, 0);
  sctx.globalCompositeOperation = 'source-atop';
  const grad = sctx.createLinearGradient(...angle from dx_, dy_);
  grad.addColorStop(0, themeRimColor(theme, 0.35 * (1 - nightIntensity * 2)));
  grad.addColorStop(0.5, '...');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, scratch.width, scratch.height);

  // Blit scratch onto main ctx WITHOUT the facing flip (use post-restore() position)
  ctx.drawImage(scratch, dx_, dy_, dw, dh);
}
```

## Files modified on this branch

- `src/engine/rimLight.ts` (new) — emitter pattern, URL param, hotkey, localStorage
- `src/engine/rendering/players.ts` — `applyRimLight()`, cache-key extension, subscribe-to-clear
- `src/main.tsx` — `initRimLight()` + `installRimLightHotkey()` calls

## How to resume

```bash
cd .worktrees/rim-light
git pull origin main --rebase
npm install
npm run dev -- --port 5176 --strictPort
# Browser: http://localhost:5176/bunnybrawl/?rim=on&arena=meadow&bots=2
# In-game: 'R' to toggle
```

Storage key: `carrotroyale_rim_light` (string `'1'` for on, `'0'` for off).
