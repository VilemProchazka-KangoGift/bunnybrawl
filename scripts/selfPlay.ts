/**
 * Self-play training-data generation script.
 *
 * Runs N episodes of headless self-play, recording per-tick observations,
 * actions, and rewards to a single NDJSON file. The recorder appends across
 * episodes so the output is one file per invocation containing many matches.
 *
 * Usage:
 *   npx vite-node scripts/selfPlay.ts
 *   npx vite-node scripts/selfPlay.ts -- --episodes 50 --arena meadow --out data/run1.ndjson --seed 42
 *
 * Defaults: 5 episodes, meadow arena, 4 players (2 human-driven by RandomInput,
 * 2 bots), 30-second episodes (1800 ticks at 60Hz), output to
 * `selfplay-output.ndjson` in the current directory.
 *
 * The script imports from src/engine/headless/ — pure Node, no browser deps.
 *
 * NOTE: this is a baseline scaffold. Real training pipelines will:
 *   - Replace RandomInput with a learned BatchedPolicy
 *   - Tune RewardWeights per task
 *   - Possibly run multiple matches in parallel via worker_threads
 */

/// <reference types="node" />
import { resolve } from 'node:path';
import { registerBuiltinArenas } from '../src/engine/arenas/builtin';
import { registerBuiltinCharacters } from '../src/engine/characters/builtin';
import { getArena } from '../src/engine/arenas';
import { SeededRNG } from '../src/engine/net/prng';
import { HeadlessRunner } from '../src/engine/headless/HeadlessRunner';
import { NDJSONFileRecorder } from '../src/engine/headless/recording';
import { RewardShaper } from '../src/engine/headless/reward';
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
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    episodes: 5,
    arenaId: 'meadow',
    out: 'selfplay-output.ndjson',
    seed: 42,
    ticks: 1800, // 30s at 60Hz
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--episodes') args.episodes = Number(argv[++i]);
    else if (a === '--arena') args.arenaId = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--ticks') args.ticks = Number(argv[++i]);
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
  recorder: NDJSONFileRecorder,
): Promise<{ winner: PlayerSlot | null; ticks: number; reason: 'match_over' | 'max_ticks' }> {
  const players: PlayerSlot[] = ['P1', 'P2', 'B1', 'B2'];
  const seed = args.seed + episodeIndex;

  const inputs = new Map<PlayerSlot, PlayerInput>();
  inputs.set('P1', new RandomInput('P1', new SeededRNG(seed ^ 0xa1)));
  inputs.set('P2', new RandomInput('P2', new SeededRNG(seed ^ 0xa2)));

  const shapers = new Map<PlayerSlot, RewardShaper>();
  for (const s of players) shapers.set(s, new RewardShaper(s));

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
      tags: { episode: episodeIndex, seed, source: 'selfPlay.ts' },
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
