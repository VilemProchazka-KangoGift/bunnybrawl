# SFX Lab — Design

**Date:** 2026-04-27
**Goal:** Improve gameplay sound effects and add per-event runtime variation, by iterating in the browser against a local sample library and committing winners to a manifest the engine reads at startup.

## Why

The current ~30 procedural SFX have two problems:

1. Several feel placeholder-grade — the goal is to find better-sounding versions.
2. High-replay-rate events (`jump`, `land`, `oof`, footsteps, periodic ambients like `amb_drip`, `amb_bird_chirp`) play the *exact same waveform* every time, which is fatiguing in a 90-second match.

We have a 516-file local sample library at `P:\projects\asssets\sfx` (Kenney game packs + Sonniss GDC2026 bundle). Kenney is particularly well-suited: short OGGs, semantically named (`footstep_grass_000.ogg` … `004.ogg`), small file size, CC0 licensed.

## Approach

Iteration happens in the existing **superpowers brainstorming Visual Companion** — a dev web server that serves HTML pages from a session directory and reports clicks back to me. I push one page per sound (or a small batch of pages) with `<audio>` candidates and multi-select; the user listens and selects; I read events, update the running selection, advance to the next sound. When a batch is approved I write the manifest and copy chosen samples into the game repo. The game gains a small runtime piece (manifest loader + random-pick on play) but no UI.

## Non-goals (v1)

- **Character voice variation** — the 17 character grunts stay as-is. Future work can extend the same pattern to `CharacterPack.createSound`.
- **Weighted variant probabilities** — uniform random for v1. The data model leaves room for weights but the lab UI doesn't expose them.
- **In-game context preview** — playing sounds inside a live match is a follow-up. v1 only previews in the companion.
- **Editing procedural-synthesis params via UI** — candidates from the procedural side are pre-generated in code, not knob-tweaked in the browser.
- **Permanent in-game lab UI** — the iteration tool is companion-served and ephemeral. Nothing in `src/components/` for it.

## Architecture

### Two halves

**Ephemeral (companion session)** — lives in `.superpowers/brainstorm/<session>/` (gitignored, project-scoped):
- `content/sound-<name>.html` — one page per sound being iterated, with `<audio>` candidates and multi-select buttons
- `content/assets/<sound>/<id>.ogg` — candidate sample files copied from `P:\projects\asssets\sfx` so the companion's static server can serve them
- Inline WAV data URIs for procedural candidates (no file copy needed)
- `state/events` — companion-recorded click stream, read between turns

**Persistent (game repo)** — committed:
- `src/engine/audio/sfxManifest.json` — the production manifest, edited by me as I save batches
- `src/engine/audio/sfxManifest.ts` — loader + schema validator
- `src/engine/audio/soundRegistry.ts` — modified to consult manifest
- `src/engine/audio/AudioManager.ts` — modified `play(name)` to random-pick across an array of Howls
- `public/audio/sfx/<sound>/<id>.ogg` — only the winning samples, kept in sync with the manifest
- `scripts/copySfxFromManifest.ts` — given a manifest, copies referenced files from the asset library into `public/audio/sfx/` and removes orphans

The companion side has zero code in `src/`. The game side has no UI code.

### Iteration loop

1. **Start the companion** with `--project-dir P:\projects\rabbits`. The session dir is `<project>/.superpowers/brainstorm/<id>/`. Add `.superpowers/` to `.gitignore` if not already.
2. **Plan the order**: I work through the sound list in priority order (highest replay-rate first — jump, land, footsteps, oof, then combat, then periodic ambients, then UI). One sound = one HTML page. I batch related ones (the four footsteps, the six ambient periodics) onto a single page when sensible.
3. **Per page, I generate**:
   - **Candidates list**: 1 procedural baseline + 0–4 procedural variants (parameter perturbations of the existing generator, defined per-sound in code) + top filename matches from the asset library (capped at 8). Existing manifest entries are pre-checked so going back to a previous selection is one click.
   - **HTML**: `<audio src="...">` plus a play button per candidate, a multi-select chip, the `<div class="options" data-multiselect>` shell from the companion's CSS, and a Submit button that flushes selection state to `state/events`.
   - **Procedural audio**: emitted as `data:audio/wav;base64,...` URIs inline (no file write). The existing `floatBufferToWavDataUri()` helper already returns this format.
   - **Sample audio**: copied from `P:\projects\asssets\sfx\<rel>` to `<session>/content/assets/<sound>/<id>.ogg`, referenced as `assets/<sound>/<id>.ogg` (relative URL the companion serves).
4. **User listens, selects winners, clicks Submit**. Companion writes events.
5. **On my next turn** I read `state/events`, fold them into the in-memory selection state for that sound, and either (a) push a refined page if they want different candidates, or (b) advance to the next sound.
6. **End-of-batch save**: when a chunk is done (e.g. all movement sounds), I:
   - Write/update `src/engine/audio/sfxManifest.json` with the new entries
   - Run `scripts/copySfxFromManifest.ts` to sync `public/audio/sfx/` with the new manifest (copies new winners, deletes orphans)
   - Commit both in one commit
   - User reloads the dev game and confirms the new sounds work in context. If something's off, we revisit just that sound — the manifest makes single-sound replacement trivial.
7. Loop until all sounds in the budget table are addressed.

### Manifest format (unchanged from prior draft)

```json
{
  "version": 1,
  "sounds": {
    "jump": {
      "kind": "samples",
      "volume": 0.3,
      "variants": [
        { "id": "jump_a", "source": "kenney_impact-sounds/Audio/impactSoft_medium_000.ogg" },
        { "id": "jump_b", "source": "kenney_impact-sounds/Audio/impactSoft_medium_002.ogg" }
      ]
    },
    "stomp": { "kind": "procedural" },
    "footstep_grass": {
      "kind": "samples",
      "volume": 0.15,
      "variants": [
        { "id": "fs_grass_0", "source": "kenney_impact-sounds/Audio/footstep_grass_000.ogg" },
        { "id": "fs_grass_1", "source": "kenney_impact-sounds/Audio/footstep_grass_001.ogg" },
        { "id": "fs_grass_2", "source": "kenney_impact-sounds/Audio/footstep_grass_002.ogg" }
      ]
    }
  }
}
```

- `kind: "procedural"` (or absence of an entry) means use the existing synthesis generator unchanged. No samples shipped for that sound.
- `kind: "samples"` replaces procedural for that sound. The procedural version is no longer registered for that name. (Always shown as a candidate in the companion, so re-selecting it is one click.)
- `id` is stable; written to `public/audio/sfx/<sound>/<id>.ogg`. `source` is the path within the asset library — used by the copy script and shown in the companion UI for traceability.
- `volume` overrides the sound's volume per-entry, so a louder/quieter sample can be re-balanced without editing engine code.

### Engine wiring changes

**`soundRegistry.ts`** — replace static `SFX_DEFS` / `AMBIENT_DEFS` / `PERIODIC_DEFS` arrays with a builder that consults `sfxManifest.json`:

- For each declared name, if manifest has `kind: "samples"`, register an array of Howls under that key (one per variant), using `src: ['/audio/sfx/<name>/<id>.ogg']` and the manifest's `volume`.
- Otherwise register a single procedural Howl as today.

The existing declarative tables stay as the **source of truth for which sounds exist** — adding a new `SoundName` still requires a code change in one place. The manifest only chooses whether each declared sound is procedural or sample-backed.

**`AudioManager`** — change the internal map type from `Map<string, Howl>` to `Map<string, Howl | Howl[]>`. On `play(name)`, if the value is an array, pick `arr[Math.floor(Math.random() * arr.length)]`. Single-Howl entries unchanged. `Math.random()` is fine here — SFX selection is purely cosmetic and never crosses the network or the rollback resimulation path (audio plays are already gated behind `_audioEnabled`).

Loops (`amb_wind`, `crowd`, etc.) only ever have one variant per the budget table, so the looping code path doesn't need to handle arrays in v1. Add a runtime assertion that loop-flagged sounds have ≤1 variant in the manifest.

### Sound list — variation budget

| Group | Sound | Target variants | Notes |
|---|---|---|---|
| Player movement | `jump` | 3–5 | highest replay rate |
| | `land` | 2–3 | |
| | `footstep_grass` | 3–4 | Kenney has 5 already (`footstep_grass_000`–`004`) |
| | `footstep_wood` | 3–4 | use Kenney `impactWood`/`footstep_carpet` family |
| | `crouch` | 1–2 | |
| | `fastfall` | 1 | |
| Combat & impact | `stomp` | 2–3 | |
| | `headbonk` | 1–2 | |
| | `bump` | 2–3 | player-vs-player push |
| | `oof` | 3–5 | use Sonniss Vox Hominis if Kenney impacts feel wrong |
| | `thornhit` | 2 | |
| | `crunch` | 2–3 | carrot bite |
| | `splash` | 1–2 | |
| | `spring` | 1–2 | |
| UI / match flow | `select`, `victory`, `countdown_beep`, `countdown_go` | 1 each | one-shots |
| Ambient loops | `ambient`, `crowd`, `zero_g`, `waterfall_ambient`, `amb_wind`, `amb_lava`, `amb_underwater_bubbles`, `amb_space_hum` | 1 each | loops; variation comes from layering, not random pick |
| Periodic ambient | `geyser` | 2 | |
| | `pigeon_scatter` | 2 | |
| | `amb_bird_chirp` | 3–5 | very repetition-prone |
| | `amb_ghost_hoo` | 2–3 | |
| | `amb_volcano_burst` | 2 | |
| | `amb_drip` | 3–5 | very repetition-prone |

Upper-bound bundle cost: ~70 OGGs at typical Kenney size 10–30 KB ≈ 1–2 MB added. Negligible vs the existing arena MP3s.

### Companion HTML page sketch

Per sound, a page like this gets pushed to `content/sound-jump.html`:

```html
<h2>Sound: <code>jump</code></h2>
<p class="subtitle">Played on every jump. Highest replay rate — variation matters.
  Select 3–5 winners.</p>

<div class="options" data-multiselect>
  <div class="option" data-choice="proc-current" onclick="toggleSelect(this)">
    <div class="letter">▶</div>
    <div class="content">
      <h3>Procedural — current</h3>
      <p>What ships today.</p>
      <audio controls src="data:audio/wav;base64,…"></audio>
    </div>
  </div>

  <div class="option" data-choice="proc-bright" onclick="toggleSelect(this)">
    <div class="letter">▶</div>
    <div class="content">
      <h3>Procedural — brighter</h3>
      <p>Pitch +15%, env shorter.</p>
      <audio controls src="data:audio/wav;base64,…"></audio>
    </div>
  </div>

  <div class="option" data-choice="kenney-impactSoft_medium_000"
       onclick="toggleSelect(this)">
    <div class="letter">▶</div>
    <div class="content">
      <h3>kenney_impact / impactSoft_medium_000</h3>
      <audio controls src="assets/jump/kenney_impact_soft_med_000.ogg"></audio>
    </div>
  </div>

  <!-- … more sample candidates … -->
</div>

<button class="mock-button" onclick="submitSelections()">Save jump selections</button>
```

The companion's frame template auto-injects the toggle/select infrastructure and CSS. The "Save" button writes a `submit` event; on my next turn I read `state/events`, find the most recent set of selections for `sound-jump.html`, and persist them.

## Testing

- **Unit tests** for `sfxManifest.ts`: parsing, fallback to procedural when manifest missing, schema validation, asserting every name in the manifest is a valid `SoundName`.
- **Unit test** for `AudioManager.play`: array entry random-picks; covered by mocking `Math.random()`.
- **Unit test** for `soundRegistry`: manifest entry produces N Howls under one key; missing/procedural entry produces 1 Howl.
- **Unit test** that loop-flagged sounds reject manifest entries with >1 variant.
- The companion tooling and `scripts/copySfxFromManifest.ts` are dev-time only; tested manually via the round-trip "save in companion → reload game → hear new sound."

## Risks / Edge cases

- **Asset folder path is hardcoded.** Lives at `P:\projects\asssets\sfx` on this machine. The copy script reads it from an env var (`SFX_LIB_PATH`) with that as the default, so the project is portable.
- **OGG decoding.** Howler defaults to Web Audio for OGG; Chrome/Firefox/Edge handle it natively. Safari 17+ supports it. Our actual user base (desktop + Chrome on mobile) is fine.
- **Manifest drift vs `SoundName` union.** New `SoundName` without manifest → procedural (game still works). `SoundName` removed but still in manifest → CI test fails.
- **License compliance.** Kenney is CC0, no attribution required, but `public/audio/sfx/CREDITS.md` is good practice. Sonniss GDC bundle: per-publisher licenses inside the bundle's PDF, royalty-free for commercial use; record source per-clip in the manifest's `source` field (already in the schema).
- **Browser caching during iteration.** When I push a new HTML file the companion serves the latest by mtime, but `<audio>` elements may cache the OGG. I include a cachebuster query (`?v=<timestamp>`) on sample URLs so re-downloads land cleanly.
- **Companion server lifetime.** Auto-exits after 30 min idle. If it stops mid-session I restart it and continue — selections so far are already persisted in the manifest at the last save point.

## Open questions (resolved)

- ~~Character voices in v1?~~ No, deferred. Same architecture extends to `CharacterPack.createSound` later.
- ~~Weighted variants?~~ No, uniform v1. Data model leaves room (could add `weight: number` to each variant later) but companion UI doesn't expose it.
- ~~In-game context preview?~~ Deferred. Companion only.
- ~~Permanent in-game lab UI?~~ No. Companion-served and ephemeral.
