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
import { DEFAULT_REWARD_WEIGHTS, RewardShaper } from '../src/engine/headless/reward';
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
  /** Resolved reward weights for this run (defaults merged with file + CLI overrides). */
  rewardWeights: Required<RewardWeights>;
}

const REWARD_WEIGHT_KEYS = Object.keys(DEFAULT_REWARD_WEIGHTS) as Array<keyof RewardWeights>;

function loadRewardsFile(path: string): Partial<RewardWeights> {
  const raw = readFileSync(resolve(process.cwd(), path), 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const out: Partial<RewardWeights> = {};
  for (const k of REWARD_WEIGHT_KEYS) {
    const v = parsed[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
    } else if (v !== undefined) {
      throw new Error(`--rewards-file: '${k}' must be a finite number, got ${JSON.stringify(v)}`);
    }
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

  // First pass: file-loaded weights (lower precedence than CLI flags).
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--rewards-file') {
      const fileWeights = loadRewardsFile(argv[++i]);
      Object.assign(args.rewardWeights, fileWeights);
    }
  }

  // Second pass: everything else, including --reward.<key> overrides.
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--episodes') args.episodes = Number(argv[++i]);
    else if (a === '--arena') args.arenaId = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--ticks') args.ticks = Number(argv[++i]);
    else if (a === '--rewards-file') i++; // already handled
    else if (a.startsWith('--reward.')) {
      const key = a.slice('--reward.'.length) as keyof RewardWeights;
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

function flattenWeightsAsTags(w: Required<RewardWeights>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of REWARD_WEIGHT_KEYS) out[`reward.${k}`] = w[k] as number;
  return out;
}

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
      // Header tags become part of every episode's first NDJSON line. Stamping
      // the resolved weights here makes each output file self-describing — a
      // training run can recover the exact shaping used to produce its data.
      tags: {
        episode: episodeIndex,
        seed,
        source: 'selfPlay.ts',
        ...flattenWeightsAsTags(args.rewardWeights),
      },
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
  const startMs = Date.now();
  const summaries: Array<{ episode: number; winner: PlayerSlot | null; ticks: number; reason: string }> = [];

  for (let i = 0; i < args.episodes; i++) {
    const summary = await runEpisode(i, args, recorder);
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
