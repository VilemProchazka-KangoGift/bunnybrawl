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

  constructor(_slot: string, characterName: string, difficulty: BotDifficulty) { // slot used as map key by caller
    this.personality = getPersonality(characterName);
    this.difficulty = getDifficultyParams(difficulty);

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

  getInput(self: Player, state: MatchState, arena: Arena): InputState {
    if (!self.active || self.state === 'splat' || self.state === 'respawning') {
      return NO_INPUT;
    }

    // Taunt: freeze briefly after getting a kill
    if (self.score > this.lastScore) {
      this.tauntTimer = 20 + Math.floor(Math.random() * 15);
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

    // Compute ideal input
    const ideal = this.computeIdealInput(self, state, arena);

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
        this.jumpCooldown = 20;
      }
    }

    return delayed;
  }

  private computeIdealInput(self: Player, state: MatchState, arena: Arena): InputState {
    if (this.stuckTimer > 45) {
      this.stuckTimer = 0;
      // Use nav target to escape in the right direction (jump over obstacles, drop off edges)
      const preferSafe = this.personality.cautiousness >= 1.2;
      const stuckAwareness = buildAwareness(self, state, arena, this.difficulty.awarenessRadius, this.difficulty.pathfindingDepth, preferSafe);
      if (stuckAwareness.navTarget) {
        const dx = stuckAwareness.navTarget.approachX - self.x;
        return {
          left: dx < -10,
          right: dx > 10,
          jump: stuckAwareness.navTarget.type !== 'd',
          down: stuckAwareness.navTarget.type === 'd',
        };
      }
      return {
        left: Math.random() > 0.5,
        right: Math.random() > 0.5,
        jump: true,
        down: false,
      };
    }

    const preferSafe = this.personality.cautiousness >= 1.2;
    const awareness = buildAwareness(self, state, arena, this.difficulty.awarenessRadius, this.difficulty.pathfindingDepth, preferSafe);

    // Search pause: when nothing is in immediate radius, pause briefly before roaming
    const nothingNearby = !awareness.nearestEnemy && !awareness.stompTarget && !awareness.stompThreat
      && !awareness.nearestCarrot && awareness.airborneAbove.length === 0 && awareness.nearbyHazards.length === 0;
    if (nothingNearby && !this.wasIdle) {
      this.searchTimer = 30 + Math.floor(Math.random() * 50);
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

    const scores = evaluateActions(awareness, this.personality);

    // Add chaos noise
    if (this.personality.chaosAffinity > 0) {
      const noise = this.personality.chaosAffinity * 0.3;
      scores.moveLeft += (Math.random() - 0.5) * noise;
      scores.moveRight += (Math.random() - 0.5) * noise;
      scores.jump += (Math.random() - 0.5) * noise * 0.5;
      scores.drop += (Math.random() - 0.5) * noise * 0.3;
    }

    const netHorizontal = scores.moveRight - scores.moveLeft;
    return {
      left: netHorizontal < -MOVE_THRESHOLD,
      right: netHorizontal > MOVE_THRESHOLD,
      jump: scores.jump > JUMP_THRESHOLD,
      down: scores.drop > DROP_THRESHOLD,
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
