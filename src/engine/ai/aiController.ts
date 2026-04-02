import type { Player, MatchState, Arena, InputState, BotDifficulty } from '../types';
import type { AIPersonality, DifficultyParams } from './types';
import { buildAwareness } from './awareness';
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

  constructor(_slot: string, characterName: string, difficulty: BotDifficulty, botIndex = 0) { // slot used as map key by caller
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
  }

  getWalkSpeedMult(): number {
    return this.difficulty.walkSpeedMult;
  }

  getInput(self: Player, state: MatchState, arena: Arena, carrotChase = false, mirrorNav = false): InputState {
    if (!self.active || self.state === 'splat' || self.state === 'respawning') {
      return NO_INPUT;
    }

    // Taunt: freeze briefly after getting a kill
    if (self.score > this.lastScore) {
      const tf = this.difficulty.tauntFrames;
      this.tauntTimer = Math.floor(tf * 0.6) + Math.floor(Math.random() * Math.ceil(tf * 0.4));
      this.lastScore = self.score;
    }
    if (this.tauntTimer > 0) {
      this.tauntTimer--;
      return { left: false, right: false, jump: false, down: this.tauntTimer % 6 < 3 };
    }

    // Stuck detection
    const moved = Math.abs(self.x - this.lastX) + Math.abs(self.y - this.lastY);
    if (moved < 2) {
      this.stuckTimer++;
    } else {
      this.stuckTimer = 0;
    }
    this.lastX = self.x;
    this.lastY = self.y;

    // Hesitation: randomly freeze
    if (this.difficulty.hesitationChance > 0 && Math.random() < this.difficulty.hesitationChance) {
      return NO_INPUT;
    }

    // Throttle: only compute new decisions every 3rd frame (staggered by botIndex).
    // On skipped frames, re-push the previous decision so the ring buffer advances at full speed.
    this.frameCounter++;
    const isDecisionFrame = this.frameCounter % 3 === this.botIndex % 3;
    const ideal = isDecisionFrame
      ? this.computeIdealInput(self, state, arena, carrotChase, mirrorNav)
      : this.ringBuffer[(this.ringWrite - 1 + this.ringSize) % this.ringSize];

    // Push through ring buffer
    this.ringBuffer[this.ringWrite] = ideal;
    this.ringWrite = (this.ringWrite + 1) % this.ringSize;
    const delayed = this.ringBuffer[this.ringRead];
    this.ringRead = (this.ringRead + 1) % this.ringSize;

    // Decay jump cooldown
    if (this.jumpCooldown > 0) this.jumpCooldown--;

    // Apply difficulty noise
    if (Math.random() < this.difficulty.noiseChance) {
      return this.randomInput();
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

  private computeIdealInput(self: Player, state: MatchState, arena: Arena, carrotChase = false, mirrorNav = false): InputState {
    // Build awareness ONCE, reuse for stuck recovery and normal path
    const preferSafe = this.personality.cautiousness >= 1.2;
    const awareness = buildAwareness(self, state, arena, this.difficulty.awarenessRadius, this.difficulty.pathfindingDepth, preferSafe, mirrorNav);

    if (this.stuckTimer > 45) {
      this.stuckTimer = 0;
      // Use nav target to escape in the right direction (jump over obstacles, drop off edges)
      if (awareness.navTarget) {
        const dx = awareness.navTarget.approachX - self.x;
        return {
          left: dx < -10,
          right: dx > 10,
          jump: awareness.navTarget.type !== 'd',
          down: awareness.navTarget.type === 'd',
        };
      }
      return {
        left: Math.random() > 0.5,
        right: Math.random() > 0.5,
        jump: true,
        down: false,
      };
    }

    // Search pause: when nothing is in immediate radius, pause briefly before roaming
    const nothingNearby = !awareness.nearestEnemy && !awareness.stompTarget && !awareness.stompThreat
      && !awareness.nearestCarrot && awareness.airborneAbove.length === 0 && awareness.nearbyHazards.length === 0;
    if (nothingNearby && !this.wasIdle) {
      const sp = this.difficulty.searchPauseFrames;
      this.searchTimer = sp > 0 ? Math.floor(sp * 0.4) + Math.floor(Math.random() * Math.ceil(sp * 0.6)) : 0;
      this.wasIdle = true;
    }
    if (!nothingNearby) {
      this.wasIdle = false;
      this.searchTimer = 0;
    }
    if (this.searchTimer > 0) {
      this.searchTimer--;
      return NO_INPUT;
    }

    // Wolf special: target the score leader
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
        awareness.nearestEnemy = { x: leader.x, y: leader.y, vx: leader.vx, vy: leader.vy, dx, dy, dist, score: leader.score };
      }
    }

    const scores = evaluateActions(awareness, this.personality, this.difficulty.precisionMult, carrotChase);

    // Add chaos noise (suppressed at high difficulty)
    const effectiveChaos = this.personality.chaosAffinity * (1 - this.difficulty.chaosSuppress);
    if (effectiveChaos > 0) {
      const noise = effectiveChaos * 0.3;
      scores.moveLeft += (Math.random() - 0.5) * noise;
      scores.moveRight += (Math.random() - 0.5) * noise;
      scores.jump += (Math.random() - 0.5) * noise * 0.5;
      scores.drop += (Math.random() - 0.5) * noise * 0.3;
    }

    // Precision-adjusted thresholds: impossible bots act on weaker signals
    const pm = this.difficulty.precisionMult;
    const moveT = MOVE_THRESHOLD * (1 - pm * 0.5);   // 0.20 → 0.10
    const jumpT = JUMP_THRESHOLD * (1 - pm * 0.45);  // 0.55 → 0.30
    const dropT = DROP_THRESHOLD * (1 - pm * 0.4);   // 0.50 → 0.30

    const netHorizontal = scores.moveRight - scores.moveLeft;
    return {
      left: netHorizontal < -moveT,
      right: netHorizontal > moveT,
      jump: scores.jump > jumpT,
      down: scores.drop > dropT,
    };
  }

  private randomInput(): InputState {
    return {
      left: Math.random() > 0.5,
      right: Math.random() > 0.5,
      jump: Math.random() > 0.92,
      down: Math.random() > 0.95,
    };
  }
}
