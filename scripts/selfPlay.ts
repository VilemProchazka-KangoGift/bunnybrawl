/**
 * Self-play training-data generation script.
 *
 * Runs N episodes of headless self-play, recording per-tick observations,
 * actions, and rewards to a single NDJSON file. The recorder appends across
 * episodes so the output is one file per invocation containing many matches.
 *
 * Wire format: see `docs/headless-recording-format.md`.
 *
 * Usage:
 *   npx vite-node scripts/selfPlay.ts
 *   npx vite-node scripts/selfPlay.ts -- --episodes 50 --arena meadow --out data/run1.ndjson --seed 42
 *
 * Reward weight overrides (defaults from RewardShaper, see docs):
 *   --reward.killBonus 1.5 --reward.carrotBonus 0.3 ...
 *   --rewards-file weights.json   (loads { killBonus: 1.5, ... }; CLI flags override)
 *
 * Defaults: 5 episodes, meadow arena, 4 players (2 human-driven by RandomInput,
 * 2 bots), 30-second episodes (1800 ticks at 60Hz), output to
 * `selfplay-output.ndjson` in the current directory.
 *
 * The script imports from src/engine/headless/ — pure Node, no browser deps.
 *
 * NOTE: this is a baseline scaffold. Real training pipelines will:
 *   - Replace RandomInput with a learned BatchedPolicy
 *   - Tune RewardWeights via --reward.* flags or a JSON file
 *   - Possibly run multiple matches in parallel via worker_threads
 */

/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { registerBuiltinArenas } from '../src/engine/arenas/builtin';
import { registerBuiltinCharacters } from '../src/engine/characters/builtin';
import { getArena } from '../src/engine/arenas';
import { SeededRNG } from '../src/engine/net/prng';
import { HeadlessRunner } from '../src/engine/headless/HeadlessRunner';
import { NDJSONFileRecorder } from '../src/engine/headless/recording';
import {
  DEFAULT_REWARD_WEIGHTS,
  REWARD_WEIGHT_KEYS,
  RewardShaper,
  weightsToTagRecord,
} from '../src/engine/headless/reward';
import type { RewardWeights } from '../src/engine/headless/reward';
import { RandomInput } from '../src/engine/input/RandomInput';
import { RuleBasedBot } from '../src/engine/input/RuleBasedBot';
import type { MatchSettings, PlayerSlot } from '../src/engine/types';
import type { PlayerInput } from '../src/engine/input/PlayerInput';
import type { HeadlessRunnerConfig } from '../src/engine/headless/types';

interface CliArgs {
  episodes: number;
  arenaId: string;
  out: string;
  seed: number;
  ticks: number;
  /** Resolved reward weights (defaults merged with file + CLI overrides). */
  rewardWeights: Required<RewardWeights>;
}

const REWARD_FLAG_PREFIX = '--reward.';

function loadRewardsFile(path: string): Partial<RewardWeights> {
  const raw = readFileSync(resolve(process.cwd(), path), 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  for (const k of Object.keys(parsed)) {
    if (!REWARD_WEIGHT_KEYS.includes(k as keyof RewardWeights)) {
      throw new Error(
        `--rewards-file: unknown key '${k}'. Valid keys: ${REWARD_WEIGHT_KEYS.join(', ')}`,
      );
    }
  }
  const out: Partial<RewardWeights> = {};
  for (const k of REWARD_WEIGHT_KEYS) {
    const v = parsed[k];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`--rewards-file: '${k}' must be a finite number, got ${JSON.stringify(v)}`);
    }
    out[k] = v;
  }
  return out;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    episodes: 5,
    arenaId: 'meadow',
    out: 'selfplay-output.ndjson',
    seed: 42,
    ticks: 1800, // 30s at 60Hz
    rewardWeights: { ...DEFAULT_REWARD_WEIGHTS },
  };

  // File loaded first so individual --reward.<key> flags below override it.
  const fileIdx = argv.indexOf('--rewards-file');
  if (fileIdx >= 0) Object.assign(args.rewardWeights, loadRewardsFile(argv[fileIdx + 1]));

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--episodes') args.episodes = Number(argv[++i]);
    else if (a === '--arena') args.arenaId = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--ticks') args.ticks = Number(argv[++i]);
    else if (a === '--rewards-file') i++;
    else if (a.startsWith(REWARD_FLAG_PREFIX)) {
      const key = a.slice(REWARD_FLAG_PREFIX.length) as keyof RewardWeights;
      if (!REWARD_WEIGHT_KEYS.includes(key)) {
        throw new Error(`Unknown reward weight: '${key}'. Valid keys: ${REWARD_WEIGHT_KEYS.join(', ')}`);
      }
      const v = Number(argv[++i]);
      if (!Number.isFinite(v)) {
        throw new Error(`--reward.${key}: expected finite number, got '${argv[i]}'`);
      }
      args.rewardWeights[key] = v;
    }
  }

  return args;
}

const BASE_MODS = {
  extremeGore: false,
  carrotChase: false,
  giantPlayers: false,
  turbo: false,
  superBounce: false,
  mirrorArena: false,
  underwaterGravity: false,
};

function makeSettings(arenaId: string): MatchSettings {
  return {
    killLimit: 16,
    timeLimit: 0,
    playerCount: 4,
    goreMode: false,
    arenaId,
    botCount: 2,
    botDifficulty: 'medium',
    mods: BASE_MODS,
  };
}

async function runEpisode(
  episodeIndex: number,
  args: CliArgs,
  weightTags: Readonly<Record<string, number>>,
  recorder: NDJSONFileRecorder,
): Promise<{ winner: PlayerSlot | null; ticks: number; reason: 'match_over' | 'max_ticks' }> {
  const players: PlayerSlot[] = ['P1', 'P2', 'B1', 'B2'];
  const seed = args.seed + episodeIndex;

  const inputs = new Map<PlayerSlot, PlayerInput>();
  inputs.set('P1', new RandomInput('P1', new SeededRNG(seed ^ 0xa1)));
  inputs.set('P2', new RandomInput('P2', new SeededRNG(seed ^ 0xa2)));

  const shapers = new Map<PlayerSlot, RewardShaper>();
  for (const s of players) shapers.set(s, new RewardShaper(s, args.rewardWeights));

  const config: HeadlessRunnerConfig = {
    arenaId: args.arenaId,
    activePlayers: players,
    settings: makeSettings(args.arenaId),
    rng: new SeededRNG(seed),
    inputs,
    maxTicks: args.ticks,
    recording: {
      recorder,
      slots: players,
      rewardShapers: shapers,
      tags: { episode: episodeIndex, seed, source: 'selfPlay.ts', ...weightTags },
    },
  };

  const runner = new HeadlessRunner(config);

  // Skip countdown so the recorded data spans actual gameplay, not 3 seconds
  // of idle countdown ticks.
  runner.getSimulator().getState().countdown = 0;

  // Wire RuleBasedBots post-construction (they need the simulator's AIController).
  const arena = getArena(args.arenaId);
  for (const slot of ['B1', 'B2'] as PlayerSlot[]) {
    const ai = runner.getSimulator().getAIControllers().get(slot)!;
    runner.getSimulator().setPlayerInput(slot, new RuleBasedBot(slot, ai, arena, false, false));
  }

  const result = runner.runMatch();
  return { winner: result.winner, ticks: result.ticks, reason: result.reason };
}

async function main(): Promise<void> {
  registerBuiltinArenas();
  registerBuiltinCharacters();

  const args = parseArgs(process.argv.slice(2));
  const outPath = resolve(process.cwd(), args.out);
  console.log(`Self-play data generation → ${outPath}`);
  console.log(
    `  episodes=${args.episodes}  arena=${args.arenaId}  ticks/episode=${args.ticks}  base seed=${args.seed}`,
  );
  const overrides = REWARD_WEIGHT_KEYS.filter(
    k => args.rewardWeights[k] !== DEFAULT_REWARD_WEIGHTS[k],
  );
  if (overrides.length === 0) {
    console.log('  reward weights: defaults (see DEFAULT_REWARD_WEIGHTS in src/engine/headless/reward.ts)');
  } else {
    const summary = overrides.map(k => `${k}=${args.rewardWeights[k]}`).join(' ');
    console.log(`  reward weights: ${overrides.length} override${overrides.length === 1 ? '' : 's'} — ${summary}`);
  }

  const recorder = new NDJSONFileRecorder(outPath);
  const weightTags = weightsToTagRecord(args.rewardWeights);
  const startMs = Date.now();
  const summaries: Array<{ episode: number; winner: PlayerSlot | null; ticks: number; reason: string }> = [];

  for (let i = 0; i < args.episodes; i++) {
    const summary = await runEpisode(i, args, weightTags, recorder);
    summaries.push({ episode: i, ...summary });
    console.log(
      `  episode ${i + 1}/${args.episodes}: winner=${summary.winner ?? 'null'} ticks=${summary.ticks} reason=${summary.reason}`,
    );
  }

  await recorder.flush();
  const elapsedMs = Date.now() - startMs;

  console.log('');
  console.log(`Done in ${elapsedMs}ms`);
  console.log(`  total ticks simulated: ${summaries.reduce((s, x) => s + x.ticks, 0)}`);
  console.log(`  output: ${outPath}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
