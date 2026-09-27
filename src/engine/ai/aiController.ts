import type { Player, MatchState, Arena, InputState, BotDifficulty } from '../types';
import type { AIPersonality, DifficultyParams, AwarenessSnapshot } from './types';
import type { SeededRNG } from '../net/prng';
import type { AISnapshot } from '../net/serialize';
import { buildAwarenessInto, createAwarenessScratch, type AwarenessScratch } from './awareness';
import { evaluateActions } from './utility';
import { getPersonality, getDifficultyParams } from './personality';

const MOVE_THRESHOLD = 0.20;
const JUMP_THRESHOLD = 0.55;
const DROP_THRESHOLD = 0.5;

const NO_INPUT: InputState = { left: false, right: false, jump: false, down: false };

export class AIController {
  private personality: AIPersonality;
  private difficulty: DifficultyParams;
  // Ring buffer for reaction delay (avoids O(n) Array.shift)
  private ringBuffer: InputState[];
  private ringWrite = 0;
  private ringRead = 0;
  private ringSize: number;
  private stuckTimer = 0;
  private lastX = 0;
  private lastY = 0;
  private jumpCooldown = 0;
  private lastScore = 0;
  private tauntTimer = 0;
  private searchTimer = 0;
  private wasIdle = false;
  private frameCounter = 0;
  private botIndex: number;
  private _lastNavTarget: AwarenessSnapshot['navTarget'] = null;
  private readonly _awarenessScratch: AwarenessScratch = createAwarenessScratch();
  /** Reused score buffer for evaluateActions — zeroed at the top of each call. */
  private readonly _actionScores: { moveLeft: number; moveRight: number; jump: number; drop: number } =
    { moveLeft: 0, moveRight: 0, jump: 0, drop: 0 };
  /** Reused InputState for early-exit return paths (taunt, randomInput). The
   *  ring buffer slots are independent pre-allocated instances; this scratch
   *  covers the paths that bypass the ring. */
  private readonly _returnScratch: InputState = { left: false, right: false, jump: false, down: false };
  private rng?: SeededRNG;

  constructor(_slot: string, characterName: string, difficulty: BotDifficulty, botIndex = 0, rng?: SeededRNG) { // slot used as map key by caller
    this.personality = getPersonality(characterName);
    this.difficulty = getDifficultyParams(difficulty);
    this.botIndex = botIndex;

    // Pre-fill ring buffer with no-ops
    this.ringSize = this.difficulty.reactionFrames + 1;
    this.ringBuffer = new Array(this.ringSize);
    for (let i = 0; i < this.ringSize; i++) {
      this.ringBuffer[i] = { left: false, right: false, jump: false, down: false };
    }
    this.ringWrite = this.difficulty.reactionFrames;
    this.ringRead = 0;
    this.rng = rng;
  }

  /** Inject seeded RNG (called when GameLoop.setRng propagates to AI controllers). */
  setRng(rng: SeededRNG): void {
    this.rng = rng;
  }

  /** Return seeded float if rng provided, else Math.random(). */
  private rnd(): number {
    return this.rng ? this.rng.nextFloat() : Math.random();
  }

  getWalkSpeedMult(): number {
    return this.difficulty.walkSpeedMult;
  }

  getLastNavTarget(): AwarenessSnapshot['navTarget'] {
    return this._lastNavTarget;
  }

  getInput(self: Player, state: MatchState, arena: Arena, carrotChase = false, mirrorNav = false): InputState {
    if (!self.active || self.state === 'splat' || self.state === 'respawning') {
      return NO_INPUT;
    }

    // Taunt: freeze briefly after getting a kill
    if (self.score > this.lastScore) {
      const tf = this.difficulty.tauntFrames;
      this.tauntTimer = Math.floor(tf * 0.6) + Math.floor(this.rnd() * Math.ceil(tf * 0.4));
      this.lastScore = self.score;
    }
    if (this.tauntTimer > 0) {
      this.tauntTimer--;
      const r = this._returnScratch;
      r.left = false; r.right = false; r.jump = false; r.down = this.tauntTimer % 6 < 3;
      return r;
    }

    // Stuck detection — but only when the bot is actually trying to move.
    // During search-pause (intentional idle) or taunt (post-kill freeze), no
    // movement is expected, so don't accumulate stuckTimer toward the
    // 45-frame nav-jump threshold or the bot fires spurious mid-roam jumps
    // when the search-pause ends.
    const moved = Math.abs(self.x - this.lastX) + Math.abs(self.y - this.lastY);
    const intentionallyIdle = this.searchTimer > 0;
    if (intentionallyIdle) {
      this.stuckTimer = 0;
    } else if (moved < 2) {
      this.stuckTimer++;
    } else {
      this.stuckTimer = 0;
    }
    this.lastX = self.x;
    this.lastY = self.y;

    // Hesitation: randomly freeze
    if (this.difficulty.hesitationChance > 0 && this.rnd() < this.difficulty.hesitationChance) {
      return NO_INPUT;
    }

    // Throttle: only compute new decisions every 3rd frame (staggered by botIndex).
    // On skipped frames, copy the previous decision forward so the ring buffer
    // advances at full speed. We write into the existing pre-allocated slot
    // rather than assigning a new reference; the slot identity stays stable
    // across ticks and the ring stops allocating per push.
    this.frameCounter++;
    const isDecisionFrame = this.frameCounter % 3 === this.botIndex % 3;
    const writeSlot = this.ringBuffer[this.ringWrite];
    if (isDecisionFrame) {
      this.computeIdealInputInto(writeSlot, self, state, arena, carrotChase, mirrorNav);
    } else {
      const prevSlot = this.ringBuffer[(this.ringWrite - 1 + this.ringSize) % this.ringSize];
      writeSlot.left = prevSlot.left;
      writeSlot.right = prevSlot.right;
      writeSlot.jump = prevSlot.jump;
      writeSlot.down = prevSlot.down;
    }
    this.ringWrite = (this.ringWrite + 1) % this.ringSize;
    const delayed = this.ringBuffer[this.ringRead];
    this.ringRead = (this.ringRead + 1) % this.ringSize;

    // Decay jump cooldown
    if (this.jumpCooldown > 0) this.jumpCooldown--;

    // Apply difficulty noise
    if (this.rnd() < this.difficulty.noiseChance) {
      this.randomInputInto(this._returnScratch);
      return this._returnScratch;
    }

    // Consume jump (only fire once, then cooldown)
    if (delayed.jump) {
      if (this.jumpCooldown > 0) {
        delayed.jump = false;
      } else {
        this.jumpCooldown = this.difficulty.jumpCooldownFrames;
      }
    }

    return delayed;
  }

  private computeIdealInputInto(out: InputState, self: Player, state: MatchState, arena: Arena, carrotChase = false, mirrorNav = false): void {
    // Build awareness once, reuse for stuck recovery and normal path
    const preferSafe = this.personality.cautiousness >= 1.2;
    const awareness = buildAwarenessInto(this._awarenessScratch, self, state, arena, this.difficulty.awarenessRadius, this.difficulty.pathfindingDepth, preferSafe, mirrorNav);
    this._lastNavTarget = awareness.navTarget;

    if (this.stuckTimer > 45) {
      this.stuckTimer = 0;
      // Pre-consume rnd() so RNG advances identically regardless of navTarget
      const escapeR1 = this.rnd();
      const escapeR2 = this.rnd();
      // Use nav target to escape in the right direction (jump over obstacles, drop off edges)
      if (awareness.navTarget) {
        const dx = awareness.navTarget.approachX - self.x;
        out.left = dx < -10;
        out.right = dx > 10;
        out.jump = awareness.navTarget.type !== 'd';
        out.down = awareness.navTarget.type === 'd';
        return;
      }
      out.left = escapeR1 > 0.5;
      out.right = escapeR2 > 0.5;
      out.jump = true;
      out.down = false;
      return;
    }

    // Search pause: when nothing is in immediate radius, pause briefly before roaming
    const searchRnd = this.rnd(); // always consume so RNG advances identically
    const nothingNearby = !awareness.nearestEnemy && !awareness.stompTarget && !awareness.stompThreat
      && !awareness.nearestCarrot && awareness.airborneAbove.length === 0 && awareness.nearbyHazards.length === 0;
    if (nothingNearby && !this.wasIdle) {
      const sp = this.difficulty.searchPauseFrames;
      this.searchTimer = sp > 0 ? Math.floor(sp * 0.4) + Math.floor(searchRnd * Math.ceil(sp * 0.6)) : 0;
      this.wasIdle = true;
    }
    if (!nothingNearby) {
      this.wasIdle = false;
      this.searchTimer = 0;
    }
    if (this.searchTimer > 0) {
      this.searchTimer--;
      out.left = false; out.right = false; out.jump = false; out.down = false;
      return;
    }

    // Wolf special: target the score leader. Mutates awareness._nearestEnemy
    // in place — awareness.nearestEnemy already points at that scratch when set
    // (or is null; we only enter this branch if nearestEnemy is non-null).
    if (this.personality.targetLeader && awareness.nearestEnemy) {
      let leader: Player | null = null;
      let bestScore = self.score;
      for (const p of state.players) {
        if (p.id !== self.id && p.active && p.state !== 'splat' && p.state !== 'respawning' && p.score > bestScore) {
          leader = p;
          bestScore = p.score;
        }
      }
      if (leader) {
        const dx = leader.x - self.x;
        const dy = leader.y - self.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ne = this._awarenessScratch._nearestEnemy;
        ne.x = leader.x; ne.y = leader.y; ne.vx = leader.vx; ne.vy = leader.vy;
        ne.dx = dx; ne.dy = dy; ne.dist = dist; ne.score = leader.score;
        // awareness.nearestEnemy already === ne, no reassignment needed.
      }
    }

    const scores = evaluateActions(awareness, this.personality, this.difficulty.precisionMult, carrotChase, this.rng, this._actionScores);

    // Add chaos noise (suppressed at high difficulty)
    const effectiveChaos = this.personality.chaosAffinity * (1 - this.difficulty.chaosSuppress);
    if (effectiveChaos > 0) {
      const noise = effectiveChaos * 0.3;
      scores.moveLeft += (this.rnd() - 0.5) * noise;
      scores.moveRight += (this.rnd() - 0.5) * noise;
      scores.jump += (this.rnd() - 0.5) * noise * 0.5;
      scores.drop += (this.rnd() - 0.5) * noise * 0.3;
    }

    // Precision-adjusted thresholds: impossible bots act on weaker signals
    const pm = this.difficulty.precisionMult;
    const moveT = MOVE_THRESHOLD * (1 - pm * 0.5);   // 0.20 → 0.10
    const jumpT = JUMP_THRESHOLD * (1 - pm * 0.45);  // 0.55 → 0.30
    const dropT = DROP_THRESHOLD * (1 - pm * 0.4);   // 0.50 → 0.30

    const netHorizontal = scores.moveRight - scores.moveLeft;
    out.left = netHorizontal < -moveT;
    out.right = netHorizontal > moveT;
    out.jump = scores.jump > jumpT;
    out.down = scores.drop > dropT;
  }

  /** Serialize internal state for rollback snapshot. */
  serialize(): { ringBuffer: InputState[]; ringWrite: number; ringRead: number; stuckTimer: number; lastX: number; lastY: number; jumpCooldown: number; lastScore: number; tauntTimer: number; searchTimer: number; wasIdle: boolean; frameCounter: number } {
    return {
      ringBuffer: this.ringBuffer.map(i => ({ ...i })),
      ringWrite: this.ringWrite,
      ringRead: this.ringRead,
      stuckTimer: this.stuckTimer,
      lastX: this.lastX,
      lastY: this.lastY,
      jumpCooldown: this.jumpCooldown,
      lastScore: this.lastScore,
      tauntTimer: this.tauntTimer,
      searchTimer: this.searchTimer,
      wasIdle: this.wasIdle,
      frameCounter: this.frameCounter,
    };
  }

  /** Serialize internal state into an existing target (zero allocation in steady state). */
  serializeInto(target: AISnapshot): void {
    for (let i = 0; i < this.ringBuffer.length; i++) {
      if (i < target.ringBuffer.length) {
        target.ringBuffer[i].left = this.ringBuffer[i].left;
        target.ringBuffer[i].right = this.ringBuffer[i].right;
        target.ringBuffer[i].jump = this.ringBuffer[i].jump;
        target.ringBuffer[i].down = this.ringBuffer[i].down;
      } else {
        target.ringBuffer.push({ ...this.ringBuffer[i] });
      }
    }
    target.ringBuffer.length = this.ringBuffer.length;
    target.ringWrite = this.ringWrite;
    target.ringRead = this.ringRead;
    target.stuckTimer = this.stuckTimer;
    target.lastX = this.lastX;
    target.lastY = this.lastY;
    target.jumpCooldown = this.jumpCooldown;
    target.lastScore = this.lastScore;
    target.tauntTimer = this.tauntTimer;
    target.searchTimer = this.searchTimer;
    target.wasIdle = this.wasIdle;
    target.frameCounter = this.frameCounter;
  }

  /** Restore internal state from rollback snapshot. */
  restore(snap: AISnapshot): void {
    for (let i = 0; i < snap.ringBuffer.length && i < this.ringBuffer.length; i++) {
      this.ringBuffer[i].left = snap.ringBuffer[i].left;
      this.ringBuffer[i].right = snap.ringBuffer[i].right;
      this.ringBuffer[i].jump = snap.ringBuffer[i].jump;
      this.ringBuffer[i].down = snap.ringBuffer[i].down;
    }
    this.ringWrite = snap.ringWrite;
    this.ringRead = snap.ringRead;
    this.stuckTimer = snap.stuckTimer;
    this.lastX = snap.lastX;
    this.lastY = snap.lastY;
    this.jumpCooldown = snap.jumpCooldown;
    this.lastScore = snap.lastScore;
    this.tauntTimer = snap.tauntTimer;
    this.searchTimer = snap.searchTimer;
    this.wasIdle = snap.wasIdle;
    this.frameCounter = snap.frameCounter;
  }

  private randomInputInto(out: InputState): void {
    out.left = this.rnd() > 0.5;
    out.right = this.rnd() > 0.5;
    out.jump = this.rnd() > 0.92;
    out.down = this.rnd() > 0.95;
  }
}
