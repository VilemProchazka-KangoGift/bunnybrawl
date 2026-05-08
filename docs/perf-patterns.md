# Canvas2D Performance Patterns

## Pattern: Replace large-area `CanvasGradient` fills with cached image strips

### Symptom

A `ctx.fillRect(0, 0, W, H)` (or any large fill) using a `CanvasGradient` as
`fillStyle` is significantly slower than the same fill with a flat color, even
when the gradient itself is cached and reused across frames. The cost grows
with pixel count — full-canvas gradient fills add ~5ms/frame on a 1280×720
backing store.

### Root cause

When `fillStyle` is a `CanvasGradient`, the browser evaluates the gradient
function per-pixel during the fill. For a linear gradient with N stops, this
means an interpolation over the gradient's domain for every covered pixel. On
a full-canvas fill, that's ~920k pixel function evaluations per frame.

In contrast:

- A flat-color fillRect over the same area is a memset/blend with a single
  color value — far less per-pixel work.
- A `drawImage` of a small precomputed strip stretched to the full size is a
  texture sample. With `imageSmoothingEnabled = false`, the GPU does
  nearest-neighbor sampling, which is essentially a memcpy + alpha blend.

### Concrete numbers (winter_lake scene tint, 1280×720 backing)

| Approach | avg frame ms | long(>16.67ms) |
|----------|--------------|----------------|
| `createLinearGradient` + `fillRect` (original) | 15.0 | 27% |
| Flat-color `fillRect` | 9.7 | 5% |
| Cached 4×720 strip + `drawImage` (smoothing on) | 13.5 | 22% |
| Cached 4×720 strip + `drawImage` (smoothing off) | 11.8 | 6% |
| **Cached 1×720 strip + `drawImage` (smoothing off)** | **9.2** | **4%** |

The 1×720 strip with smoothing off matches flat-color performance while
preserving the full vertical gradient.

### Recipe

```ts
// Module-scope cache (stable for the arena lifetime).
let _tintCache: OffscreenCanvas | null = null;
function getTintCache(): OffscreenCanvas | null {
  if (_tintCache) return _tintCache;
  if (typeof OffscreenCanvas === 'undefined') return null;
  // 1px wide is enough when the gradient varies only along Y. Use a 1px tall
  // strip if it varies only along X. Use a small 2D cache (e.g. 32×32) if it
  // varies in both dimensions.
  _tintCache = new OffscreenCanvas(1, CANVAS_HEIGHT);
  const c = _tintCache.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  g.addColorStop(0, 'rgba(123, 224, 163, 1.0)');
  g.addColorStop(0.45, 'rgba(163, 232, 255, 0.643)');
  g.addColorStop(1, 'rgba(123, 224, 163, 0.214)');
  c.fillStyle = g;
  c.fillRect(0, 0, 1, CANVAS_HEIGHT);
  return _tintCache;
}

// Per-frame draw — replaces a full-canvas gradient fill.
const cache = getTintCache();
if (cache) {
  ctx.save();
  ctx.globalAlpha = nightIntensity * 1.4;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cache, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.restore();
}
```

### When to apply

Apply when **all** of the following are true:

1. The fill happens every frame (or many frames per match).
2. The gradient itself doesn't change shape per frame (only its overall alpha
   may modulate via `globalAlpha`).
3. The destination is one of:
   - A **rectangular** `fillRect`/`drawImage` of any size — direct
     `drawImage` swap, near-zero overhead, almost always a win once the fill
     is over ~5k pixels.
   - A **simple path** (low-vertex ellipse, polygon) over ~30k+ pixels
     where clipping the path then `drawImage` still beats per-pixel
     gradient eval.
   - A **complex path** (wavy edge, 50+ vertices) over ~50k+ pixels where
     the clip-mask setup cost is amortized.

Skip when:

- The fill area is small (<10k pixels) AND uses a complex path. The path
  setup + clip-mask cost exceeds the per-pixel-eval saving. Real example:
  volcano lava-haze (3 zones × ~140×80 = 33k px wavy path) regressed when
  converted from `fill()` with cached gradient → `clip()` + `drawImage`
  (path complexity dominated).
- The gradient is unique per fill and not reused across frames.
- The shape varies and you'd need to rebuild the cache every frame anyway.

**Pixel-count threshold rule of thumb**:
- Linear gradient on rectangle: any size — `fillRect` swap is free.
- Linear gradient on simple path: ~10k+ px before clip+drawImage wins.
- Linear gradient on complex/wavy path: ~50k+ px.
- Radial gradient: thresholds drop ~30% (radial per-pixel eval is more
  expensive than linear, so the swap pays back faster).

### When the fill follows a custom path (not a rectangle)

Use `clip()` + `drawImage` to apply the cached strip through an arbitrary
shape. Pattern (used in `drawCurrentZone` for the wavy waterfall edges):

```ts
ctx.beginPath();
// ...build wavy path...
ctx.closePath();
ctx.save();
ctx.clip();
ctx.imageSmoothingEnabled = false;
ctx.drawImage(stripCache, regionX, regionY, regionW, regionH);
ctx.restore();
```

`clip()` adds a small constant cost (path setup), but the drawImage portion is
much cheaper than `fill()` with a gradient.

### Known applications in this codebase

- `winterLake.ts` `drawSceneTint` — full-canvas night tint
- `rendering/hazards.ts` `drawCurrentZone` — waterfall body fill (clipped path)
- `rendering/effects.ts` `getAfterglowGradient` — dawn/dusk overlay (next)

## Pattern: Inline closures over per-frame `pointAt(t)` callbacks

### Symptom

A draw fn computes a curve via `const pointAt = (t) => ({ x, y })` and calls
the closure 15-30 times in inner stroke/leaf loops. Closures + `{ x, y }`
object literals show up as a hot spot in the perf profile.

### Fix

Inline the closure body at each call site. `{ x, y }` becomes two locals
(`px`, `py`); V8 scalar-replaces them into registers without escape analysis
having to track them through a closure.

### Real result (`underwater.ts` `drawSeaweed`, 30 stalks × 30Hz)

Avg frame 7.7ms → 7.2ms (`-0.5ms`, ~7% better). Long frames 1/600 → 0/600.
See commit `0d38a06`.

## Pattern: Alpha bucketing for batched per-particle paths

### Symptom

A loop draws N particles each with a unique alpha, requiring one
`globalAlpha` mutation + one `beginPath`/`fill` per particle. With N ≈ 30-50
this dominates `drawAnimatedBackground` cost.

### Fix

Quantize alpha into K buckets (4-6). Per particle, push (x, y, r) into the
bucket's reusable `Path2D` via `moveTo` + `arc` sub-paths. After the loop,
iterate buckets and stroke/fill each one once. K ≪ N so the operation count
collapses dramatically.

```ts
const K = 5;
const buckets: (Path2D | null)[] = new Array(K).fill(null);
// ...per frame:
for (let b = 0; b < K; b++) buckets[b] = null;
for (const p of particles) {
  const b = Math.floor(p.alpha * K);
  let path = buckets[b];
  if (!path) { path = new Path2D(); buckets[b] = path; }
  path.moveTo(p.x + p.r, p.y);
  path.arc(p.x, p.y, p.r, 0, Math.PI * 2);
}
for (let b = 0; b < K; b++) {
  const path = buckets[b];
  if (path) {
    ctx.globalAlpha = (b + 0.5) / K;
    ctx.fill(path);
  }
}
```

### Real result (`underwater.ts` `drawAnimatedBackground`, ~46 bubbles)

Avg frame 7.2ms → 6.5ms (`-0.7ms`, ~10% better). p99 14.0 → 9.0
(huge tail-latency win — the per-particle `beginPath` was the worst-case
GC trigger). 76 path operations/frame collapsed to ~10. See commit `44ca136`.

### Counter-example: don't pre-bake small paths to Path2D when each needs a transform

Tried baking each seaweed stalk's natural curve to a `Path2D`, then drawing
under a per-stalk shear transform (`save`/`transform`/`stroke(path)`/`restore`)
to apply the bend offset. Result: regressed avg 6.5ms → 19.0ms, with 64% of
frames exceeding 16.7ms. Root cause: `save`/`restore` × 30 stalks/frame
×30Hz = 1800 state-stack pushes/sec dominates the savings from skipping
per-frame `Math.sin` calls. **Use Path2D pre-bake only when the path is
drawn at the identity transform** (e.g. cached gradient strips), or batch
many paths under a single `save`/`restore` pair.
