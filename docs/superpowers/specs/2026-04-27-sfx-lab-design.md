# SFX Lab — Design

**Date:** 2026-04-27
**Goal:** Improve gameplay sound effects and add per-event runtime variation, by iterating in the browser against a local sample library and committing winners to a manifest the engine reads at startup.

## Why

The current ~30 procedural SFX have two problems:

1. Several feel placeholder-grade — the goal is to find better-sounding versions.
2. High-replay-rate events (`jump`, `land`, `oof`, footsteps, periodic ambients like `amb_drip`) play the *exact same waveform* every time, which is fatiguing in a 90-second match.

We have a 516-file local sample library at `P:\projects\asssets\sfx` (Kenney game packs + Sonniss GDC2026 bundle). Kenney is particularly well-suited: short OGGs, semantically named (`footstep_grass_000.ogg` … `004.ogg`), small file size, CC0 licensed.

## Approach

A dev-only React route `/sfx-lab` mounted in the existing Vite app. For each `SoundName` it shows the current implementation plus a row of candidate clips, lets you preview them inline, and persists multi-select winners to a manifest committed to the repo. The engine reads that manifest at startup. When a sound has multiple winners, `audio.play(name)` random-picks per call.

## Non-goals (v1)

- **Character voice variation** — the 17 character grunts stay as-is. Future work can extend the same pattern to `CharacterPack.createSound`.
- **Weighted variant probabilities** — uniform random for v1. The data model leaves room for weights but the lab UI doesn't expose them.
- **In-game context preview** — playing sounds inside a live match is a follow-up. v1 only previews in the lab.
- **Editing procedural-synthesis params via UI** — candidates from the procedural side are pre-generated in code, not knob-tweaked in the browser.

## Architecture

### Components

```
src/components/SfxLab/
  SfxLab.tsx               # Page: header, sound-row list, save button
  SoundRow.tsx             # One row per SoundName: current + candidates + select toggles
  CandidateCard.tsx        # Play/pause button, label, source-pack tag, selected indicator
  useSfxLabStore.ts        # Zustand store: selections, dirty flag, save action
  candidateProviders.ts    # Functions producing candidates per sound (procedural + sample matches)
  sampleIndex.ts           # Loads & caches the dev-time index of P:\projects\asssets\sfx

vite-plugin-sfx-assets.ts  # Vite dev plugin: serves /sfx-assets/* from P:\projects\asssets\sfx
                           # and exposes /sfx-assets/index.json (file list, generated on dev start)

src/engine/audio/
  sfxManifest.json         # Committed manifest: sound name → variant list
  sfxManifest.ts           # Loads manifest, exposes resolveVariants(name)
  soundRegistry.ts         # MODIFIED: consults manifest before falling back to procedural
  AudioManager.ts          # MODIFIED: play(name) random-picks among Howls when name has variants

public/audio/sfx/<sound>/<id>.ogg  # Final shipped samples (copied from asset library on save)

scripts/
  copySfxFromManifest.ts   # On lab "Save", reads manifest, copies referenced files from
                           # P:\projects\asssets\sfx to public/audio/sfx/, removes orphans
```

### Data flow

**Dev / lab time:**
1. Dev starts Vite. `vite-plugin-sfx-assets` walks `P:\projects\asssets\sfx`, builds an index of `.ogg/.wav/.mp3` files with size + relative path, exposes both `/sfx-assets/index.json` and the files themselves under `/sfx-assets/...`.
2. User opens `/sfx-lab`. UI fetches the index plus the current `sfxManifest.json`.
3. For each `SoundName`, `candidateProviders.ts` produces a candidate list:
   - **`current`** — whatever the running engine plays for this name today: if the manifest already maps it to samples, those sample variants appear first (with a "current" tag); otherwise the procedural generator output appears first. So "current" reflects what the player actually hears now, not necessarily procedural.
   - **`procedural`** — the procedural generator output. Shown even when the manifest currently overrides it, so going back to procedural is one click.
   - **`procedural-variant`** — 0–4 pre-coded parameter perturbations of the procedural generator (defined in code per sound, e.g. for `jump`: pitch ±15%, env shorter/longer, square↔triangle).
   - **`sample`** — top filename matches from the asset index, scored by keyword (e.g. `jump` matches files containing "jump"; `footstep_grass` matches `footstep_grass_*`). Already-selected samples appear first; remaining matches capped at 8 per sound to keep the UI scannable.
4. User clicks any candidate to play (Howler-backed `<audio>`). User toggles 1–N candidates as winners. Selections live in the Zustand store with a dirty flag.
5. User clicks **Save**. The store POSTs the new manifest to a Vite middleware endpoint that:
   - Writes `src/engine/audio/sfxManifest.json`
   - Runs `scripts/copySfxFromManifest.ts` to sync `public/audio/sfx/`
   - Returns success.

**Runtime (production + non-lab dev):**
1. App boots. `registerAllSounds()` reads `sfxManifest.json`.
2. Per sound:
   - **Procedural entry** (no manifest override): unchanged — one Howl backed by the existing generator. Same as today.
   - **Sample entry with one variant**: one Howl with `src: ['/audio/sfx/<sound>/<id>.ogg']`.
   - **Sample entry with N variants**: an array of N Howls registered under the same key.
3. `AudioManager.play(name)`: if the entry is an array, pick a uniformly random Howl; otherwise call `.play()` on the single Howl. Same call signature as today.

### Manifest format

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
    "stomp": {
      "kind": "procedural"
    },
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

- `kind: "procedural"` (or absence of an entry) means use the existing synthesis generator unchanged. No samples shipped.
- `kind: "samples"` always replaces procedural — once a manifest entry exists the procedural version is no longer registered for that name. (Reasoning: simpler runtime, and the lab always shows the procedural version as a candidate, so it's easy to "go back" by re-saving the manifest with procedural selected.)
- `id` is stable and is the filename written to `public/audio/sfx/<sound>/<id>.ogg`. `source` is the path within the asset library, used by the copy script and shown in the UI for traceability.
- `volume` overrides the volume in `soundRegistry.ts` per-sound so a louder/quieter sample can be re-balanced without re-saving the engine code.

### Vite asset plugin

Dev-only (gated by `command === 'serve'`). Two responsibilities:

1. **Static-serve** files under `/sfx-assets/<rel-path>` from `P:\projects\asssets\sfx`. Read-only, dev-only — never bundled into production.
2. **Index endpoint** at `/sfx-assets/index.json` returning `[{ path: "kenney_impact-sounds/Audio/footstep_grass_000.ogg", size: 12345 }, ...]`. Walked once at plugin startup; refreshed on the rare case the asset folder changes (re-walk every 60s or on `?refresh=1`).
3. **Save endpoint** at `POST /sfx-lab/save` accepting the new manifest JSON, writing it to disk, running the copy script. Returns 200 on success.

The plugin is registered in `vite.config.ts` behind `if (mode === 'development')` so production builds don't include it and don't expose the asset folder.

### Sound list — variation budget

| Group | Sound | Target variants | Notes |
|---|---|---|---|
| Player movement | `jump` | 3–5 | highest replay rate |
| | `land` | 2–3 | |
| | `footstep_grass` | 3–4 | Kenney has 5 already |
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

### Engine wiring changes

**`soundRegistry.ts`** — replace the static `SFX_DEFS` / `AMBIENT_DEFS` / `PERIODIC_DEFS` arrays with a builder that consults `sfxManifest.json`:

- For each declared name, if manifest has `kind: "samples"`, register an array of Howls under that key (one per variant), using `src: ['/audio/sfx/<name>/<id>.ogg']` and the manifest's `volume`.
- Otherwise register a single procedural Howl as today.

The existing declarative tables stay as the **source of truth for which sounds exist** (so adding a new `SoundName` still requires a code change in one place — there is no magic auto-registration from the manifest). The manifest only chooses whether each declared sound is procedural or sample-backed.

**`AudioManager.play(name)`** — change the internal map type from `Map<string, Howl>` to `Map<string, Howl | Howl[]>`. On play, if the value is an array, pick `arr[Math.floor(Math.random() * arr.length)]`. Single-Howl entries unchanged. `Math.random()` is fine here — SFX selection is purely cosmetic and never crosses the network or the rollback resimulation path (audio plays are already gated behind `_audioEnabled` for resim).

Loops (`amb_wind`, `crowd`, etc.) only ever have one variant per the budget table, so the looping path doesn't need to handle arrays in v1. Add a code-side assertion that loop-flagged sounds have ≤1 variant in the manifest.

### Lab UI sketch

```
┌─ SFX Lab ──────────────────────────────────[ Save (3 changes) ]┐
│                                                                │
│ jump                          volume [ 0.3 ]                   │
│   ▶ procedural (current)         [ baseline ]                  │
│   ▶ procedural-variant: bright   [ ]                           │
│   ▶ sample: impactSoft_med_000   [✓]    kenney_impact          │
│   ▶ sample: impactSoft_med_002   [✓]    kenney_impact          │
│   ▶ sample: thud_short_001       [ ]    kenney_impact          │
│                                                                │
│ stomp                         volume [ 0.6 ]                   │
│   ▶ procedural (current)         [✓]                           │
│   ▶ sample: impactPunch_001      [ ]    kenney_impact          │
│   …                                                            │
└────────────────────────────────────────────────────────────────┘
```

A keyboard shortcut (`Space` to play hovered, `J/K` to navigate rows) keeps iteration fast. Filter bar at top to jump to a sound by name.

## Testing

- **Unit tests** for `sfxManifest.ts`: parsing, fallback to procedural when manifest missing, schema validation.
- **Unit test** for `AudioManager.play`: array entry random-picks; covered by mocking `Math.random()`.
- **Unit test** that every name in `sfxManifest.json` is a valid `SoundName` (catches typos when the union changes).
- The lab UI is dev-only; covered by light component tests for `SoundRow` (toggle adds/removes from selection, save POSTs the right payload). Not a critical surface — production never loads it.

The Vite dev plugin and the copy script are dev-time only and don't ship; they're tested manually via the round-trip "save in lab → reload game → hear new sound."

## Risks / Edge cases

- **Asset folder path is hardcoded.** It lives at `P:\projects\asssets\sfx` on this machine. The Vite plugin should read it from an env var (`SFX_LIB_PATH`) with that as the default, so the project is portable.
- **OGG decoding on Web Audio.** Howler defaults to Web Audio for OGG, which is fine on Chrome/Firefox/Edge. Safari historically had OGG gaps but supports it from 17+. For our actual user base (desktop + Chrome on mobile) this is non-issue.
- **Manifest drift vs `SoundName` union.** If someone adds a new `SoundName` and forgets the manifest, fallback-to-procedural keeps the game working. If someone removes a `SoundName` but leaves it in the manifest, the validation test catches it in CI.
- **License compliance.** Kenney is CC0 — no attribution required but a `public/audio/sfx/CREDITS.md` is good practice. Sonniss GDC bundle is royalty-free for commercial use; check the bundle's license PDF before shipping any clip and record the source per-clip in the manifest's `source` field (already there).
- **Sound recategorization.** If a future sound switches from one-shot to looping (or vice-versa), the assertion above catches incompatible variant counts.

## Open questions (resolved)

- ~~Character voices in v1?~~ No, deferred. Same architecture extends to `CharacterPack.createSound` later.
- ~~Weighted variants?~~ No, uniform v1. Data model leaves room (could add `weight: number` to each variant later) but lab UI doesn't expose it.
- ~~In-game context preview?~~ Deferred. Lab only.
