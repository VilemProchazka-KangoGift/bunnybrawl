# Character Outlines — Status & Next Steps

**Branch:** `feat/character-outlines` (worktree at `.worktrees/character-outlines`)
**Status:** Prototype shelved 2026-04-27. Not merged. Branch retained for future polish.

## What works today

- 4 outline styles plumbed end-to-end: `none` (default), `black`, `charDark`, `adaptive`
- Style switchable three ways: URL param `?outline=<style>`, in-game `O` hotkey (cycles), localStorage persists
- Outline baked into the sprite cache via `applyOutlineToCache()` in `src/engine/rendering/players.ts`
- Cache key includes outline style + adaptive luminance class so styles can coexist
- `subscribeOutlineStyle()` clears the cache on style change
- Theme luminance auto-detected from `theme.sky` horizon stop (Rec. 601 luma, 128 split)
- Full test suite passes (only the known pre-existing `switchArena` flake fails)

## Why we shelved it

Feedback from in-game evaluation: "edges look blurry, rabbit outline is light gray, others almost black, motion lines get outlined too, looks stickered." Honest assessment: the technique works, but the polish gap to make it look professional is multi-day, and the visual gain doesn't justify it for 40px characters that already pop well via shadow + body shading + landing dust.

## Known issues + fixes (in priority order)

### 1. Motion lines / fast-fall lines get outlined

`_drawCharacterSpriteImpl` draws motion lines (airborne) and fast-fall speed lines INSIDE the cached sprite. They get outlined alongside the body, which looks wrong.

**Fix:** Move those draws OUT of `_drawCharacterSpriteImpl` and into `drawPlayer` (post-cache, around the `drawImage(cached, ...)` blit). Cache-key bit `fastFalling` becomes redundant once the fast-fall lines move out, but the squash transform still uses it — keep the bit.

**Effort:** Small (~30 min). Touch `players.ts` only.

### 2. Drop `black` and `charDark`, keep only `adaptive`

- `charDark` is per-character (uses `pack.darkColor`). Bunny's darkColor is intentionally light for body shading; it produces an unreadable gray outline. The system is working as designed — the design is wrong for outlines.
- `black` vanishes on dark themes (volcano, haunted, castle, rooftops, space station). Adaptive already handles this case.

**Fix:** Remove `'black'` and `'charDark'` from `OUTLINE_STYLES`. Simplifies cache keys and removes a dead branch in `outlineColorFor`.

**Effort:** Trivial (~10 min). Test for any UI references to the dropped style names.

### 3. Blurry edges

Root cause: the offset-stamp technique (`destination-over` blit at 4-8 pixel offsets) captures the source sprite's anti-aliased edge pixels. Each AA pixel contributes partial coverage, producing soft outline edges instead of crisp 1px hard edges.

**Three possible fixes:**

**A. Render at 2× then threshold/erode (medium):** Render the cached sprite at 2× backing store, threshold the alpha channel to {0, 1}, then downsample. Stamp from the thresholded version. Adds one alpha-threshold pass per sprite cache miss (rare). Pro: works without per-character changes. Con: thresholding can drop subtle features (whiskers, small eye details).

**B. Per-character silhouette callback (hard):** Add `drawSilhouette(ctx, cx, yOff, w, h)` to `CharacterPack`. Each pack draws ONLY filled body+head+ears in a single solid color. Outline pass uses this for the stamp source. Pro: pixel-perfect crisp outlines. Con: 17 character packs to edit; deviation from sprite shape causes "outline drifts off model" glitches.

**C. Use `ctx.filter = 'drop-shadow(...)'` (easy):** One-liner. Modern browsers support it, but quality varies and it's a known perf hazard. Worth a quick test before investing in A/B.

**Recommendation:** Try C first (5 min experiment); if visually equivalent to current technique, abandon outlines entirely. Otherwise pick A.

### 4. "Stickered" feel from any thick outline

This is intrinsic to the technique on stylized characters. No technical fix — design decision. Likely the reason commercial games rarely outline procedurally-rendered cartoon characters.

**Mitigation:** Cap thickness at exactly 1px (currently 4-offset for `black` already does this; the 8-offset 2px stamps for `charDark`/`adaptive` are too heavy). If we keep adaptive, drop to 4-offset.

## Alternative direction worth trying instead

**D5 rim light** plays in the same "make characters pop" design space but gives a directional-light feel instead of cartoon outlines:

- Sample the sky's brightest stop as the light source
- After the sprite cache blit, stroke the body silhouette only on the lit side (~120° arc of the highlight direction)
- 1px stroke in `rgba(255, 255, 255, 0.4)` or theme-derived light color

Same cache invalidation story, similar implementation pattern, but the visual result is "depth and light direction" rather than "stickered cartoon." Worth prototyping before resuming this branch.

## Files modified on this branch

- `src/engine/outlineStyle.ts` (new, ~50 lines) — emitter pattern, URL param, localStorage, hotkey
- `src/engine/rendering/players.ts` — `applyOutlineToCache`, `themeLuminance`, `outlineColorFor`, cache-key extension, subscribe-to-clear
- `src/main.tsx` — `initOutlineStyle()` + `installOutlineHotkey()` calls

## How to resume

```bash
cd .worktrees/character-outlines
git pull origin main --rebase   # catch up with main
npm install                      # if node_modules went stale
npm run dev -- --port 5175 --strictPort
# Browser: http://localhost:5175/bunnybrawl/?outline=adaptive&arena=meadow&bots=2
# In-game: press 'O' to cycle styles
```

Storage key for clearing localStorage during testing: `carrotroyale_outline_style`.
