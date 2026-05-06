# Performance Optimization Skill

Use when profiling, optimizing, or writing performance-critical code in the game engine or renderer.

## Architecture — Hot Path Overview

The game runs a **fixed 60fps timestep** with two-layer Canvas 2D rendering:
- **`gameLoop.ts` `fixedUpdate()`** — runs every 1/60s. Physics, collision, entity updates.
- **`gameLoop.ts` `loop()`** — runs every rAF tick. Accumulator, timers, calls `renderer.renderFrame()`.
- **`renderer.ts` `renderFrame()`** — clears foreground canvas, draws ALL dynamic elements every frame.
- **`renderer.ts` `renderBackground()`** — draws static background ONCE (sky, hills, platforms, background nature).
- **`renderer.ts` `renderSplatMarks()`** — draws to background canvas only when splats happen.

Everything in `fixedUpdate()` and `renderFrame()` is the **hot path** — any waste here multiplies by 60.

## Canvas 2D Performance Rules

### Tier 1 — Never do these in the hot path

| Anti-pattern | Cost | Fix |
|-------------|------|-----|
| `ctx.shadowBlur = N` | **Catastrophic** — triggers Gaussian blur per stroke/fill | Simulate glow with a wider, semi-transparent stroke underneath |
| **Large `fillRect` / `fill()` with `fillStyle = CanvasGradient`** | **Catastrophic — ~5ms/frame on a full-canvas (1280×720) fill, even when the gradient is cached.** Browser evaluates the gradient function per-pixel. | Bake gradient into a 1×N OffscreenCanvas, then `drawImage(cache, …)` stretched + `imageSmoothingEnabled = false`. Use `clip()` + drawImage for shaped fills. See `bakeVerticalGradientStrip` helper + `docs/perf-patterns.md`. |
| `ctx.createLinearGradient()` / `createRadialGradient()` in render loop (allocation only) | Medium — allocates gradient object each frame | Cache via WeakMap keyed by zone identity. Note: caching the gradient OBJECT does NOT eliminate the per-pixel cost above — only the bake-to-strip pattern does. |
| `ctx.save()` / `ctx.restore()` per particle in a loop | High — deep-clones full canvas state | Track `globalAlpha`/`fillStyle` manually, or use one save/restore wrapping the whole loop |
| `performance.now()` called multiple times per frame | Medium — system call | Cache once at top of `renderFrame()`, pass to sub-methods |
| `Array.filter()` to clean dead entities | Medium — allocates new array | Use reverse-iterate + swap-and-pop (see pattern below) |
| `Math.sqrt()` for distance comparison | Medium | Compare squared distances: `dx*dx+dy*dy < threshold*threshold` |

### Tier 2 — Minimize in hot path

| Pattern | Cost | Better |
|---------|------|--------|
| `ctx.font = '...'` per text element | ~0.1-0.2ms each | Cache last font, skip if same. Group same-font draws. |
| `` `rgba(${r},${g},${b},${a})` `` template literals | String alloc per frame | Pre-compute static color strings. For dynamic alpha, accept the cost or use `ctx.globalAlpha`. |
| Multiple `beginPath()/fill()` for same-color shapes | Draw call overhead | Batch into single path with multiple sub-paths, one `fill()`. |
| `ctx.translate()/rotate()` per particle | Transform matrix multiply | Compute rotated coords in JS, draw at computed position. |
| N particles each with unique alpha → N separate `fill()`s | State change + draw call per particle | **Alpha bucketing**: quantize alpha into 4–6 buckets, group particles by bucket, batch each bucket as one path with `moveTo` + `arc` sub-paths. See `waterfall.ts` spray (48 particles → 5 fills) and mist (10 → 3 fills). |
| `imageSmoothingEnabled = true` (default) on stretched cache blits | Bilinear filtering of every dest pixel | Set `ctx.imageSmoothingEnabled = false` before `drawImage` of a 1×N or N×1 strip stretched to full size. Saves ~2ms on full-canvas blits. Wrap in save/restore. |

### Tier 3 — Good practices

- **Batch by state**: Group draws that share `fillStyle`, `globalAlpha`, `font`. Minimize state transitions.
- **Single `drawImage()` blit** is faster than 10+ individual path draws. Pre-render static content to OffscreenCanvas.
- **Integer coordinates** avoid sub-pixel anti-aliasing. Use `Math.round()` for positions where crispness matters.
- **`ctx.globalAlpha` reset**: Set it back to 1 after use rather than relying on save/restore.

## Game Loop Performance Rules

### Swap-and-Pop Pattern (Preferred for Entity Cleanup)

Use `swapRemove` from `themes/utils.ts` in a reverse-iterate loop:

```ts
import { swapRemove } from './themes/utils';

// GOOD — O(1) removal, no allocation
for (let i = arr.length - 1; i >= 0; i--) {
  if (!isAlive(arr[i])) swapRemove(arr, i);
}

// BAD — allocates new array every frame
this.state.springs = this.state.springs.filter(s => s.life > 0);
```

Used for: particles, springs, thorns, carrots, lavaRocks, shockwaves, scoreAnimations, shootingStars, pigeon scatterParticles, afterimages.

### Cache Arena-Derived Data in Constructor

Arena layout doesn't change during a match. Compute once:

```ts
// In GameLoop constructor:
this.floatingPlatforms = arena.platforms
  .map((p, i) => ({ plat: p, idx: i }))
  .filter(({ plat }) => plat.y < 650);
this.geyserZones = (arena.effectZones || []).filter(z => z.type === 'geyser');
this.zeroGZones = (arena.effectZones || []).filter(z => z.type === 'zero_g');
this.geyserIndexMap = new Map(this.geyserZones.map((z, i) => [z, i]));
```

Never call `.filter()` on `effectZones` inside `fixedUpdate()` or `renderFrame()`.

### Squared Distance Comparisons

```ts
// BAD
if (Math.sqrt(dx * dx + dy * dy) < 100) { ... }

// GOOD
if (dx * dx + dy * dy < 10000) { ... }
```

Applies to carrot proximity (renderer), carrot spawning (gameLoop), and any future distance checks.

## Theme Performance Rules

### drawForegroundNature is HOT

`drawForegroundNature()` runs **every frame** on the foreground canvas (it's drawn over players, so it can't be on the static background layer). Keep it lean:

- **Target**: <20 canvas operations per theme
- **Never**: create gradients, use shadows, do per-pixel loops
- **Sparingly**: save/restore, translate/rotate (1-2 per theme max)
- **Consider**: Pre-rendering to OffscreenCanvas and blitting (single `drawImage` call)

### drawBackgroundNature / drawFarBackground are COLD

These only run once per match (in `renderBackground()`). Gradients, shadows, and complex paths are acceptable here.

### drawCustomThorn / drawCustomSpring run per-entity per-frame

Theme overrides for thorn/spring rendering execute once per thorn/spring per frame. Same hot-path rules as `drawForegroundNature`. Never use `ctx.shadowBlur`.

### drawWeatherParticle runs per-particle per-frame

With 30-50 weather particles, this runs 30-50 times per frame. Keep to 1-2 canvas ops per invocation.

## Scan Line / Repeating Pattern Optimization

For visual effects that repeat across the screen (scan lines, grid patterns):

```ts
// BAD — N individual fillRect calls
for (let sy = 0; sy < 720; sy += 4) {
  ctx.fillRect(0, sy, 1280, 1);  // 180 calls!
}

// GOOD — one pattern blit
let pattern: CanvasPattern | null = null;
// ... in draw:
if (!pattern) {
  const c = document.createElement('canvas');
  c.width = 1; c.height = 4;
  const pc = c.getContext('2d')!;
  pc.fillStyle = '#00CCFF';
  pc.fillRect(0, 0, 1, 1);
  pattern = ctx.createPattern(c, 'repeat')!;
}
ctx.fillStyle = pattern;
ctx.fillRect(0, 0, 1280, 720);
```

## Glow Without Shadow Blur

```ts
// BAD — triggers Gaussian blur
ctx.shadowColor = '#00CCFF';
ctx.shadowBlur = 8;
ctx.stroke();

// GOOD — double-stroke glow
ctx.globalAlpha = 0.3;
ctx.lineWidth = original + 4;
ctx.strokeStyle = glowColor;
ctx.stroke();  // wide soft pass
ctx.globalAlpha = 1;
ctx.lineWidth = original;
ctx.strokeStyle = coreColor;
ctx.stroke();  // sharp core pass
```

## OffscreenCanvas Caching

For static per-match content drawn every frame (foreground nature, zone backgrounds):

```ts
// In constructor or first render:
this.fgNatureCache = document.createElement('canvas');
this.fgNatureCache.width = CANVAS_WIDTH;
this.fgNatureCache.height = CANVAS_HEIGHT;
const cacheCtx = this.fgNatureCache.getContext('2d')!;
theme.drawForegroundNature(cacheCtx, arena);

// In renderFrame():
ctx.drawImage(this.fgNatureCache, 0, 0);  // single blit replaces 20+ draw calls
```

### Counter-example: not all caching is a win

**Big alpha-blended canvas blits aren't free.** Caching the waterfall drift band
(3 sin-wave layers across ~660px height, refreshed at 10Hz to an OffscreenCanvas
the full canvas width) regressed perf across all 3 affected arenas:

| Arena    | Path-fill (baseline) | Cached blit | Δ      |
|----------|---------------------:|------------:|--------|
| waterfall|                  8.4 |         8.9 | +0.5ms |
| graveyard|                  6.8 |         7.4 | +0.6ms |
| volcano  |                  5.9 |         7.8 | +1.9ms |

Why: per-frame `drawImage` of a `1280×660` translucent canvas costs more on the
GPU composite path than rasterizing 3 sin-wave fill paths in JS. The
**gradient-strip pattern works because the cache is tiny (1×N), only the
destination is large** — the strip becomes a memory-bandwidth-bound sample, not
a per-pixel function evaluation.

**Rule of thumb**: cache when the work you're replacing is per-pixel function
evaluation (gradients, complex shaders). Don't cache when you're replacing a
handful of cheap path fills — you're trading JS work for GPU bandwidth, and at
1280×720 alpha-blended that bandwidth isn't free either.

## Section timings vs. GPU composite

`perfTrace` spans (`fixedUpdate`, `cosmeticStep`, `renderFrame`, gameplay/cosmetic
leaves) typically capture only ~25% of a 16.6ms frame. The rest is GPU composite
+ paint, browser presentation, and event-loop overhead — **invisible to in-page
instrumentation**.

Implication: a "5ms saving" measured by replacing a full-canvas gradient with a
strip blit comes both from inside `renderFrame` AND from reduced compositor
load. Two consequences:

1. JS-side spans don't sum to the frame budget. Don't chase "missing time"
   inside scripts; it's GPU work.
2. Wall-clock frame time (Playwright `npm run perf` percentiles) is the only
   reliable measure for any change that touches large fills, alpha blends, or
   layer composition. Don't ship perf claims based on perfTrace deltas alone.

## Audio Init Performance

The `floatBufferToWavDataUri` function uses O(n^2) string concatenation. Fix with chunked conversion:

```ts
// BAD — O(n^2) string building
let binary = '';
for (let i = 0; i < bytes.length; i++) {
  binary += String.fromCharCode(bytes[i]);
}

// GOOD — O(n) chunked
const chunks: string[] = [];
for (let i = 0; i < bytes.length; i += 8192) {
  chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)));
}
return 'data:audio/wav;base64,' + btoa(chunks.join(''));
```

## CSS / Browser Performance Rules

- **Never use `backdrop-filter: blur()` during active gameplay** — triggers GPU blur on every composite. Use solid `rgba()` overlays instead.
- **Never animate `box-shadow` via CSS transitions** — each frame repaints the shadow. Apply shadow changes instantly, or use `filter: drop-shadow()` which is GPU-composited.
- **Debounce `window.resize` handlers** — fires 60+ times/sec during window drag. Use 100-200ms debounce.
- **Unmount components fully** when navigating away — CSS `@keyframes infinite` animations continue consuming GPU even if the element is off-screen but still in the DOM.

## CharacterSelect Lobby Rules

The lobby runs its own 60fps rAF loop. Same hot-path rules apply:
- Cache gradients (sky, ground, wall, ready zone) — they don't change between frames
- Don't call `i18n.t()` every frame for static strings — cache in a ref
- Don't use `[...arr1, ...arr2]` spread per frame — maintain a merged array
- Don't use `.filter()` per frame for ready-zone checks — use a for-loop

## Memory Leak Prevention

- **Cap unbounded arrays**: `splatMarks` (cap ~200), `killFeed` (cap ~10), `particles` (soft cap ~1000)
- **Clean up setTimeout/setInterval**: Store IDs in refs, clear in useEffect cleanup
- **AudioManager**: Call `sound.unload()` on all Howl instances when destroying the game loop
- **Splat marks are baked into the background canvas** — once rendered, the array entry is only needed if the background is fully redrawn. Safe to prune old entries.

## Profiling Workflow

1. Open DevTools Performance tab, record 10s of gameplay
2. Look for:
   - **Frame spikes** above 16.6ms (dropped frames)
   - **GC events** (purple bars) — indicates excessive allocations
   - **Long scripting blocks** — hover to see which function
3. Compare heavy arenas (Space Station, Volcano, Underwater) vs light (Meadow)
4. After optimization, re-record and compare frame time consistency

## Known Performance Characteristics by Arena

| Arena | Weight | Why |
|-------|--------|-----|
| Space Station | **Heaviest** | Effect zones (zero-G, geysers, currents), scan lines, LED loops, shadow blur on thorns |
| Volcano | Heavy | Weather (embers + ash), lava rocks, heat shimmer, ghosts, day/night |
| Underwater | Heavy | Caustic lights, bubble geysers, currents, foreground coral |
| CandyLand | Medium-Heavy | Sprinkle rotation loop, candy rain weather |
| Castle | Medium | Banner animations, torch effects, wind |
| Rooftops | Medium | Pigeon flocks, wind, nail gradients on thorns |
| Haunted Graveyard | Medium | Ghosts, fog, day/night, fireflies |
| Treetops | Medium | Dense foliage, wind, wildlife |
| Winter Lake | Light | Snow weather, simple decorations |
| Meadow | **Lightest** | Minimal effects, simple decorations |
