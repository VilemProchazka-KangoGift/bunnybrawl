# Headless Recording Format

Wire-format spec for the self-play training data emitted by `HeadlessRunner` via the `MatchRecorder` interface. The canonical implementation is `NDJSONFileRecorder` (line-delimited JSON, streamed to disk); `InMemoryRecorder` produces the same shape in arrays for tests.

This document is the authoritative reference for downstream training pipelines that consume the data. The code in `src/engine/headless/` is the source of truth — if this document and the code disagree, the code wins, and this document needs updating.

## Stream layout

`NDJSONFileRecorder` writes three record types, one JSON object per line, in this order:

```
{"type":"header", ...}     ← once per episode
{"type":"sample", ...}     ← once per recorded slot per tick (many)
{"type":"end",    ...}     ← once per episode
```

A single output file contains the concatenation of all episodes in the run (header / many samples / end / header / many samples / end / …). Episode boundaries are defined by header→end pairs.

## Record schemas

### `header`

```ts
{
  type: 'header',
  header: {
    arenaId: string,                  // e.g. 'meadow', 'space_station'
    seed?: number,                    // RNG seed for the episode (omitted if no rng)
    activePlayers: PlayerSlot[],      // e.g. ['P1', 'P2', 'B1', 'B2']
    startedAt: number,                // Unix-ms timestamp at episode start
    tags?: Record<string, string | number | boolean>,
  }
}
```

For runs from `scripts/selfPlay.ts`, `tags` includes `episode`, `seed`, `source: 'selfPlay.ts'`, and the resolved reward weights (`reward.killBonus`, `reward.carrotBonus`, …) — every output file is self-describing about the shaping that produced it.

### `sample`

```ts
{
  type: 'sample',
  sample: {
    tick: number,                     // 0-indexed tick within the episode
    slot: PlayerSlot,                 // 'P1'..'P5' | 'B1'..'B5'
    obs: number[],                    // length = OBSERVATION_SIZE (currently 98)
    action: { left: bool, right: bool, jump: bool, down: bool },
    reward: number,                   // scalar from RewardShaper for this tick
    done: boolean,                    // true on the LAST sample of the episode
  }
}
```

One sample per `(slot, tick)` pair. If `RecordingConfig.slots = ['P1', 'P2']` and the episode runs 1800 ticks, the file contains 3600 sample records for that episode.

`obs` is the **pre-tick** observation (snapshot before `simulator.fixedUpdate(dt)`) and `action` is what the recorded slot's `PlayerInput` returned for that tick. `reward` is the scalar attributed to the **just-completed** tick by the slot's `RewardShaper`. `done` is true only on the final sample of the episode.

### `end`

```ts
{
  type: 'end',
  result: {
    winner: PlayerSlot | null,        // null on draw / all-disconnected / max-tick exhaustion with no scorer
    ticks: number,                    // total ticks simulated this episode
    reason: 'match_over' | 'max_ticks',
  }
}
```

The full `MatchResult.finalState` is **NOT** serialized — `MatchState` contains `Map`s and circular refs that don't survive `JSON.stringify`. If you need terminal state for analysis, snapshot it from the last sample's `obs` (or extend the recorder).

## Observation layout (`obs[98]`)

Egocentric encoding from the recorded slot's perspective. Block offsets are exported from `src/engine/headless/observation.ts` — prefer the named constants (`OBS_SELF_OFFSET`, etc.) over hardcoded indices.

| Block | Indices | Floats | Constant |
|---|---|---|---|
| Match context | 0–9 | 10 | `OBS_MATCH_CONTEXT_OFFSET` |
| Self | 10–21 | 12 | `OBS_SELF_OFFSET` |
| Opponents (4 × 12) | 22–69 | 48 | `OBS_OPPONENT_OFFSET` |
| Carrots (4 × 3) | 70–81 | 12 | `OBS_CARROT_OFFSET` |
| Hazards (4 × 4) | 82–97 | 16 | `OBS_HAZARD_OFFSET` |

Padding for missing entities (fewer than `MAX_OPPONENTS` / `MAX_CARROTS` / `MAX_HAZARDS`) is zero. Egocentric X distances use a wrap-aware `wrapDx` helper because the arena wraps horizontally (`physics.wrapHorizontal`); Y does not wrap. Velocities are divided by `VELOCITY_SCALE = 600`; values can exceed 1.0 but usually fit `[-2, 2]`.

### Match context block (10) — static for the whole match

| Idx | Field | Range | Source |
|---|---|---|---|
| 0 | `carrotChase` | 0/1 | `settings.mods.carrotChase` |
| 1 | `mirrorArena` | 0/1 | `settings.mods.mirrorArena` |
| 2 | `superBounce` | 0/1 | `settings.mods.superBounce` |
| 3 | `turbo` | 0/1 | `settings.mods.turbo` |
| 4 | `giantPlayers` | 0/1 | `settings.mods.giantPlayers` |
| 5 | `underwaterGravity` | 0/1 | `settings.mods.underwaterGravity` |
| 6 | `extremeGore` | 0/1 | `settings.mods.extremeGore` |
| 7 | `killScoreValue_norm` | 0/1 | 1 normally, 0 in carrotChase (kills give 0 points) |
| 8 | `killLimit_norm` | 0–2 | `settings.killLimit / 32` (default 16 → 0.5) |
| 9 | `timeProgress` | 0–1 | `state.timeElapsed / settings.timeLimit`; 0 if no time limit |

A single trained policy can adapt across regimes (e.g. normal play vs `carrotChase` where stomps award 0 score) by reading these flags rather than being retrained per mode.

### Self block (12)

| Idx | Field | Norm | Source |
|---|---|---|---|
| 10 | `x_norm` | 0–1 | `self.x / arena.width` |
| 11 | `y_norm` | 0–1 | `self.y / arena.height` |
| 12 | `vx_norm` | ~ ±2 | `self.vx / 600` |
| 13 | `vy_norm` | ~ ±2 | `self.vy / 600` |
| 14 | `on_ground` | 0/1 | `state !== 'airborne'` |
| 15 | `fat_timer_norm` | 0–1 | `fatTimer / 6.6` (FAT_DURATION) |
| 16 | `slow_timer_norm` | 0–1 | `slowTimer / 5` ("hurt" — set by thorn / ghost / lava) |
| 17 | `invincible_timer_norm` | 0–1 | `invincibleTimer / 1.5` (post-respawn i-frames) |
| 18 | `burn_timer_norm` | 0–1 | `burnTimer / 5` (lava DoT) |
| 19 | `score_norm` | 0–2 | killLimit-relative, clamped: `clamp(score / divisor, 0, 2)` where `divisor = killLimit > 0 ? killLimit : 16` |
| 20 | `splat` | 0/1 | `state === 'splat'` |
| 21 | `respawning` | 0/1 | `state === 'respawning'` |

There is no formal "hurt" `PlayerState` — `PlayerState = 'idle' | 'run' | 'airborne' | 'splat' | 'respawning'`. "Hurt" is encoded as `slowTimer > 0`. "Fat" is `fatTimer > 0`.

### Opponent block (4 × 12) — sorted by slot id (alphabetical), excludes self

For each opponent `i ∈ 0..3` at offset `22 + i*12`:

| Off | Field | Source |
|---|---|---|
| +0 | `dx_norm` | `wrapDx(op.x - self.x, W) / W` |
| +1 | `dy_norm` | `(op.y - self.y) / H` |
| +2 | `vx_norm` | `op.vx / 600` |
| +3 | `vy_norm` | `op.vy / 600` |
| +4 | `on_ground` | `op.state !== 'airborne'` |
| +5 | `score_diff` | killLimit-relative, clamped: `clamp((op.score - self.score) / divisor, -2, 2)` (same divisor as `score_norm`) |
| +6 | `fat_timer_norm` | `op.fatTimer / 6.6` |
| +7 | `slow_timer_norm` | `op.slowTimer / 5` (hurt opponent → juicy stomp target) |
| +8 | `invincible_timer_norm` | `op.invincibleTimer / 1.5` (cannot be stomped while > 0) |
| +9 | `burn_timer_norm` | `op.burnTimer / 5` |
| +10 | `alive` | `op.active && state ∉ {splat, respawning}` |
| +11 | `present` | 1 if slot exists, 0 if zero-padded |

Opponent timer fields mirror the self block. They matter strategically: a policy that can't see `invincible_timer_norm` will waste tempo trying to stomp opponents in their post-respawn i-frames (which return no kill / no reward).

### Carrot block (4 × 3) — spawn order, active only

For each carrot `i ∈ 0..3` at offset `70 + i*3`:

| Off | Field | Source |
|---|---|---|
| +0 | `dx_norm` | `wrapDx(c.x - self.x, W) / W` |
| +1 | `dy_norm` | `(c.y - self.y) / H` |
| +2 | `present` | 1 if carrot exists, 0 if zero-padded |

### Hazard block (4 × 4) — arena-static, index order

For each hazard zone rectangle `i ∈ 0..3` at offset `82 + i*4`:

| Off | Field | Source |
|---|---|---|
| +0 | `dx_norm_left` | `wrapDx(zone.x - self.x, W) / W` |
| +1 | `dy_norm_top` | `(zone.y - self.y) / H` |
| +2 | `w_norm` | `zone.width / W` |
| +3 | `h_norm` | `zone.height / H` |

Hazard zones include lava, thorn beds, ghost rooms, etc. — anything that sets `slowTimer` / `burnTimer` on overlap.

## Reward signal (scalar per `(slot, tick)`)

Computed by `RewardShaper.observe(state)` after each `simulator.fixedUpdate(dt)`. Detection is **event-based** — `state.killFeed` for kills/deaths, `state.stats.perPlayer.get(slot).carrotsEaten` for pickups, rising-edge timer transitions for hazard hits, `state` machine transitions for fall-off. Score deltas are NOT used because `mods.carrotChase` awards 0 points for stomps, which would silently make a score-delta heuristic miss kills.

### Default weights

| Event | Weight | Detected via |
|---|---|---|
| Stomp kill | **+1.0** | `killFeed` entry where `attacker === slot` |
| Got stomped | **−1.0** | `killFeed` entry where `victim === slot` |
| Carrot pickup | **+0.5** | `stats.perPlayer.get(slot).carrotsEaten` delta |
| Match win | **+5.0** | `matchOver` false→true edge AND `winner === slot` |
| Match loss | **−2.0** | `matchOver` false→true edge AND `winner !== slot && !== null` |
| Hazard hit | **−0.3** | Rising edge of `slowTimer` OR `burnTimer` |
| Burn DoT | **−0.005/tick** | `burnTimer > 0` |
| Fall-off | **−0.5** | `state → 'respawning'` without prior `'splat'` |
| Survival | **+0.001/tick** | Alive, active, not in splat/respawning |
| Airborne | **−0.0005/tick** | Above + `state === 'airborne'` |

Defaults are exported as `DEFAULT_REWARD_WEIGHTS` from `src/engine/headless/reward.ts` (frozen object). The 1.0:0.5 kill-to-carrot ratio mirrors the in-game scoring (kill = 2pts, carrot = 1pt).

### Configuring weights per run

Three ways to override defaults, in increasing precedence:

**1. Programmatically** — pass a partial `RewardWeights` to the `RewardShaper` constructor:

```ts
import { RewardShaper } from './engine/headless';
const shaper = new RewardShaper('P1', { killBonus: 1.5, carrotBonus: 0.3 });
```

Unspecified keys fall back to `DEFAULT_REWARD_WEIGHTS`.

**2. Via JSON file** — `selfPlay.ts` accepts `--rewards-file <path>`:

```bash
# weights.json:
# { "killBonus": 1.5, "carrotBonus": 0.3, "fallOffPenalty": -1.0 }

npx vite-node scripts/selfPlay.ts -- \
  --episodes 50 --arena meadow \
  --rewards-file weights.json \
  --out data/aggressive.ndjson
```

Only finite-number fields are accepted; unknown keys throw.

**3. Via individual CLI flags** — `--reward.<key> <value>`. CLI flags override file values:

```bash
npx vite-node scripts/selfPlay.ts -- \
  --episodes 20 \
  --reward.killBonus 2.0 \
  --reward.fallOffPenalty -1.0 \
  --reward.perTickAirborne 0
```

The resolved weights are stamped into every NDJSON header's `tags` (as `reward.killBonus`, `reward.carrotBonus`, …) so the shaping that produced any given dataset can be recovered by reading the first line of the file.

## Reading the data back

Minimal Node consumer:

```ts
import { readFileSync } from 'node:fs';

const lines = readFileSync('data/run.ndjson', 'utf8').split('\n').filter(Boolean);
for (const line of lines) {
  const rec = JSON.parse(line);
  if (rec.type === 'header') console.log('episode start', rec.header);
  else if (rec.type === 'sample') {
    // rec.sample.obs is number[98]; rec.sample.action is {left,right,jump,down}
  } else if (rec.type === 'end') console.log('episode end', rec.result);
}
```

Python consumers using `numpy.frombuffer` can convert `obs` from `list[float]` → `np.float32` directly.

## Stability guarantees

- **Block offsets and widths can change.** Treat the named constants (`OBS_*_OFFSET`, `*_FEATURES`, `OBSERVATION_SIZE`) as the single source of truth. A sample's `obs.length` always equals `OBSERVATION_SIZE` at the time the file was written; consumers should verify or version-tag.
- **Field order within a block is part of the contract** for that observation size. Re-ordering fields requires bumping `OBSERVATION_SIZE` so old datasets become detectably incompatible.
- **Default reward weights can change.** Files written before a default change are still valid — the resolved weights are stamped in `header.tags`, so a consumer can always recover what shaping produced a given dataset.

## See also

- `src/engine/headless/observation.ts` — `extractObservation` implementation, all offset constants
- `src/engine/headless/reward.ts` — `RewardShaper`, `DEFAULT_REWARD_WEIGHTS`
- `src/engine/headless/recording.ts` — `MatchRecorder`, `NDJSONFileRecorder`, `Sample`, `MatchHeader`
- `scripts/selfPlay.ts` — example pipeline driver with full CLI surface
- `src/engine/AGENTS.md` § "Headless / ML pipeline" — implementation notes / design rationale
