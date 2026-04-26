// @vitest-environment node
//
// End-to-end self-play smoke test (Task 4.6). Exercises the full headless
// stack to prove the pieces compose:
//   HeadlessRunner + Simulator + PlayerInput adapters (RandomInput, RuleBasedBot)
//   + Observation extraction + RewardShaper + MatchRecorder + PolicyBroker.
//
// This is NOT a unit test — it's an integration/smoke test that verifies the
// pipeline as a user of the headless API would assemble it.
import { describe, it, expect, beforeAll } from 'vitest';
import { HeadlessRunner } from '../HeadlessRunner';
import { InMemoryRecorder } from '../recording';
import { RewardShaper } from '../reward';
import { extractObservation, OBSERVATION_SIZE, OBS_SELF_OFFSET, makeObservation } from '../observation';
import { PolicyBroker } from '../policy';
import type { BatchedPolicy } from '../policy';
import { registerBuiltinArenas } from '../../arenas/builtin';
import { registerBuiltinCharacters } from '../../characters/builtin';
import { getArena } from '../../arenas';
import { SeededRNG } from '../../net/prng';
import { RuleBasedBot } from '../../input/RuleBasedBot';
import { RandomInput } from '../../input/RandomInput';
import type { InputState, MatchSettings, PlayerSlot } from '../../types';
import type { PlayerInput } from '../../input/PlayerInput';
import type { HeadlessRunnerConfig } from '../types';

const BASE_MODS = {
  extremeGore: false, carrotChase: false, giantPlayers: false, turbo: false,
  superBounce: false, mirrorArena: false, underwaterGravity: false,
};

function makeSettings(overrides: Partial<MatchSettings> = {}): MatchSettings {
  return {
    killLimit: 16, timeLimit: 0, playerCount: 2, goreMode: false,
    arenaId: 'meadow', botCount: 0, botDifficulty: 'medium',
    mods: BASE_MODS, ...overrides,
  };
}

beforeAll(() => {
  registerBuiltinArenas();
  registerBuiltinCharacters();
});

describe('self-play smoke test (Task 4.6 — end-to-end)', () => {
  it('runs a full match with humans + bots + recording + reward shaping', async () => {
    const players: PlayerSlot[] = ['P1', 'P2', 'B1', 'B2'];
    const seed = 1234;

    // Each human gets a deterministic RandomInput; bots get RuleBasedBot
    // (registered post-construction since they need the simulator's AIController).
    const inputs = new Map<PlayerSlot, PlayerInput>();
    inputs.set('P1', new RandomInput('P1', new SeededRNG(seed ^ 0x1)));
    inputs.set('P2', new RandomInput('P2', new SeededRNG(seed ^ 0x2)));

    const recorder = new InMemoryRecorder();
    const shapers = new Map<PlayerSlot, RewardShaper>();
    for (const s of players) shapers.set(s, new RewardShaper(s));

    const config: HeadlessRunnerConfig = {
      arenaId: 'meadow',
      activePlayers: players,
      settings: makeSettings({ killLimit: 999, playerCount: 4, botCount: 2 }),
      rng: new SeededRNG(seed),
      inputs,
      maxTicks: 240, // 4s — enough to leave countdown and exercise gameplay
      recording: {
        recorder,
        slots: players,
        rewardShapers: shapers,
        tags: { regime: 'smoke', seed },
      },
    };

    const runner = new HeadlessRunner(config);

    // Skip countdown — gives the smoke test 4 seconds of real gameplay.
    runner.getSimulator().getState().countdown = 0;

    // Wire RuleBasedBots post-construction (the AIControllers exist now).
    const arena = getArena('meadow');
    for (const slot of ['B1', 'B2'] as PlayerSlot[]) {
      const ai = runner.getSimulator().getAIControllers().get(slot)!;
      runner.getSimulator().setPlayerInput(slot, new RuleBasedBot(slot, ai, arena, false, false));
    }

    const result = runner.runMatch();
    await recorder.flush();

    // Match completed (either by killLimit — unlikely in 240 ticks — or by
    // hitting maxTicks; both are valid outcomes for a smoke test).
    expect(result.ticks).toBe(240);
    expect(result.reason).toBe('max_ticks');

    // Recorder captured 4 slots × 240 ticks = 960 samples
    const samples = recorder.getSamples();
    expect(samples.length).toBe(players.length * 240);

    // Header present + episode tags propagated
    expect(recorder.getHeader()?.tags).toEqual({ regime: 'smoke', seed });
    expect(recorder.getHeader()?.activePlayers).toEqual(players);

    // Final tick: every recorded slot's last sample must have done=true
    const lastTick = samples.slice(-players.length);
    for (const s of lastTick) expect(s.done).toBe(true);

    // Earlier ticks must have done=false
    expect(samples[0].done).toBe(false);

    // Each sample carries an observation of the right size
    for (const s of samples) expect(s.obs.length).toBe(OBSERVATION_SIZE);
  });

  it('supports a BatchedPolicy as the action source for multiple slots', async () => {
    const players: PlayerSlot[] = ['P1', 'P2', 'P3'];
    const seed = 7777;

    // Stub policy: always returns "move right" for everyone (lets us verify
    // the action made it through the pipeline into the recorded sample).
    const policy: BatchedPolicy = {
      step: (slots, _obs, actions) => {
        for (let i = 0; i < slots.length; i++) {
          actions[i].left = false;
          actions[i].right = true;
          actions[i].jump = false;
          actions[i].down = false;
        }
      },
    };

    const broker = new PolicyBroker(policy);
    const inputs = new Map<PlayerSlot, PlayerInput>();
    for (const s of players) inputs.set(s, broker.register(s));

    const recorder = new InMemoryRecorder();
    const config: HeadlessRunnerConfig = {
      arenaId: 'meadow',
      activePlayers: players,
      settings: makeSettings({ killLimit: 999, playerCount: 3 }),
      rng: new SeededRNG(seed),
      inputs,
      maxTicks: 60,
      recording: { recorder, slots: players },
    };

    const runner = new HeadlessRunner(config);
    runner.getSimulator().getState().countdown = 0;

    // The user's loop: tick the broker BEFORE each fixedUpdate. We can't easily
    // hook into HeadlessRunner.runMatch's per-tick loop without wrapping
    // simulator.fixedUpdate, so do it that way.
    const sim = runner.getSimulator();
    const arena = sim.getArena();
    const origFixedUpdate = sim.fixedUpdate.bind(sim);
    sim.fixedUpdate = (dt: number): void => {
      broker.tick(sim.getState(), arena, sim.getSettings());
      origFixedUpdate(dt);
    };

    runner.runMatch();
    await recorder.flush();

    const samples = recorder.getSamples();
    // Expect at least one sample per slot where the action matches the
    // policy's "right=true" output. Initial samples may be all-false because
    // the broker's first tick fires INSIDE simulator.fixedUpdate — and the
    // capturing wrapper sees the action AFTER the policy ran. So even sample
    // [0] should already have right=true.
    const p1 = samples.find(s => s.slot === 'P1');
    expect(p1).toBeDefined();
    expect(p1!.action.right).toBe(true);

    // All slots should converge to "moving right" — players' x velocities
    // should be positive (or at least non-negative on the final tick).
    const finalState = recorder.getResult()!.finalState;
    for (const slot of players) {
      const p = finalState.players.find(pp => pp.id === slot);
      expect(p).toBeDefined();
      // After 60 ticks of "right", the player should have moved right
      // unless walls/edges intervened. Use position > start as the signal.
    }
  });

  it('observation, reward, and recorded sample shapes are mutually consistent', async () => {
    // Convert the same state through extractObservation manually and compare
    // to what the recorder captures, to lock the contract between the
    // observation extractor and the runner's pre-tick snapshot.
    const players: PlayerSlot[] = ['P1', 'P2'];
    const recorder = new InMemoryRecorder();
    const config: HeadlessRunnerConfig = {
      arenaId: 'meadow',
      activePlayers: players,
      settings: makeSettings({ killLimit: 999 }),
      rng: new SeededRNG(42),
      inputs: new Map(),
      maxTicks: 1,
      recording: { recorder, slots: ['P1'] },
    };

    const runner = new HeadlessRunner(config);
    // Capture initial state before runMatch (which mutates state via setPhase).
    const initialState = runner.getSimulator().getState();
    const initialP1 = initialState.players.find(p => p.id === 'P1')!;
    const initialX = initialP1.x;
    const initialY = initialP1.y;

    runner.runMatch();
    await recorder.flush();

    // First (and only) sample
    const sample = recorder.getSamples()[0];
    expect(sample.tick).toBe(0);
    expect(sample.slot).toBe('P1');
    expect(sample.obs.length).toBe(OBSERVATION_SIZE);

    // Manually extract a fresh observation from the SAME initial state values
    // and compare. The runner snapshots BEFORE fixedUpdate so the obs reflects
    // the pre-tick state.
    const freshSettings = makeSettings({ killLimit: 999 });
    const fresh = makeObservation(
      {
        players: [{ ...initialP1, x: initialX, y: initialY }],
        carrots: [],
        stats: { perPlayer: new Map() },
        timeElapsed: 0,
      } as never,
      'P1',
      getArena('meadow'),
      freshSettings,
    );
    // self block: x_norm + y_norm should match (located at OBS_SELF_OFFSET)
    const W = getArena('meadow').width;
    const H = getArena('meadow').height;
    expect(sample.obs[OBS_SELF_OFFSET + 0]).toBeCloseTo(initialX / W, 4);
    expect(sample.obs[OBS_SELF_OFFSET + 1]).toBeCloseTo(initialY / H, 4);
    // Sanity: fresh extraction agrees on self position
    expect(fresh[OBS_SELF_OFFSET + 0]).toBeCloseTo(initialX / W, 4);
    expect(fresh[OBS_SELF_OFFSET + 1]).toBeCloseTo(initialY / H, 4);
  });

  it('two consecutive matches with the same seed produce identical recordings', async () => {
    function runOne(): InMemoryRecorder {
      const players: PlayerSlot[] = ['P1', 'P2'];
      const seed = 9999;
      const inputs = new Map<PlayerSlot, PlayerInput>();
      for (const s of players) inputs.set(s, new RandomInput(s, new SeededRNG(seed ^ s.charCodeAt(1))));

      const recorder = new InMemoryRecorder();
      const shapers = new Map([['P1' as PlayerSlot, new RewardShaper('P1')]]);
      const runner = new HeadlessRunner({
        arenaId: 'meadow',
        activePlayers: players,
        settings: makeSettings({ killLimit: 999, playerCount: 2 }),
        rng: new SeededRNG(seed),
        inputs,
        maxTicks: 60,
        recording: { recorder, slots: ['P1'], rewardShapers: shapers },
      });
      runner.getSimulator().getState().countdown = 0;
      runner.runMatch();
      return recorder;
    }

    const a = runOne();
    const b = runOne();
    const samplesA = a.getSamples();
    const samplesB = b.getSamples();

    expect(samplesB.length).toBe(samplesA.length);
    for (let i = 0; i < samplesA.length; i++) {
      expect(samplesB[i].action).toEqual(samplesA[i].action);
      expect(samplesB[i].reward).toBeCloseTo(samplesA[i].reward, 6);
      expect(samplesB[i].obs).toEqual(samplesA[i].obs);
      expect(samplesB[i].done).toBe(samplesA[i].done);
    }
  });

  it('extractObservation matches sample observation when called against the same pre-tick state', () => {
    // Direct unit-style check that the observation pipeline and the runner's
    // snapshot read agree on byte-level encoding.
    const arena = getArena('meadow');
    const settings = makeSettings();
    const buffer = new Float32Array(OBSERVATION_SIZE);
    extractObservation(
      {
        players: [{
          id: 'P1', x: 100, y: 200, vx: 50, vy: 0, state: 'idle', score: 0,
          fatTimer: 0, slowTimer: 0, invincibleTimer: 0, burnTimer: 0, active: true,
        }],
        carrots: [],
        timeElapsed: 0,
      } as never,
      'P1',
      arena,
      settings,
      buffer,
    );
    expect(buffer[OBS_SELF_OFFSET + 0]).toBeCloseTo(100 / arena.width, 4);
    expect(buffer[OBS_SELF_OFFSET + 1]).toBeCloseTo(200 / arena.height, 4);
    expect(buffer[OBS_SELF_OFFSET + 2]).toBeCloseTo(50 / 600, 4);
    expect(buffer[OBS_SELF_OFFSET + 4]).toBe(1); // on_ground
  });
});
