import type { Player, MatchState, Arena, InputState, BotSlot, BotDifficulty } from '../types';
import type { AIPersonality, DifficultyParams } from './types';
import { buildAwareness } from './awareness';
import { evaluateActions } from './utility';
import { getPersonality, getDifficultyParams } from './personality';

// Thresholds for converting utility scores to boolean inputs
const MOVE_THRESHOLD = 0.20;
const JUMP_THRESHOLD = 0.55;
const DROP_THRESHOLD = 0.5;

const NO_INPUT: InputState = { left: false, right: false, jump: false, down: false };

export class AIController {
  private slot: BotSlot;
  private personality: AIPersonality;
  private difficulty: DifficultyParams;
  private reactionBuffer: InputState[] = [];
  private stuckTimer = 0;
  private lastX = 0;
  private lastY = 0;
  private jumpCooldown = 0; // prevent jump spam
  private lastScore = 0;
  private tauntTimer = 0; // frames to freeze after a kill (celebration)
  private searchTimer = 0; // frames to pause when nothing nearby (looking around)
  private wasIdle = false; // track if previous frame had nothing in range

  constructor(slot: BotSlot, characterName: string, difficulty: BotDifficulty) {
    this.slot = slot;
    this.personality = getPersonality(characterName);
    this.difficulty = getDifficultyParams(difficulty);

    // Pre-fill reaction buffer with no-ops
    for (let i = 0; i < this.difficulty.reactionFrames; i++) {
      this.reactionBuffer.push({ ...NO_INPUT });
    }
  }

  getWalkSpeedMult(): number {
    return this.difficulty.walkSpeedMult;
  }

  getInput(state: MatchState, arena: Arena): InputState {
    const self = state.players.find(p => p.id === this.slot);
    if (!self || !self.active || self.state === 'splat' || self.state === 'respawning') {
      return { ...NO_INPUT };
    }

    // Taunt: freeze briefly after getting a kill (celebration)
    if (self.score > this.lastScore) {
      this.tauntTimer = 20 + Math.floor(Math.random() * 15); // 0.3-0.6s
      this.lastScore = self.score;
    }
    if (this.tauntTimer > 0) {
      this.tauntTimer--;
      // Crouch-spam during taunt for style
      return { left: false, right: false, jump: false, down: this.tauntTimer % 6 < 3 };
    }

    // Stuck detection: if position hasn't changed in ~1 second (60 frames)
    const moved = Math.abs(self.x - this.lastX) + Math.abs(self.y - this.lastY);
    if (moved < 2) {
      this.stuckTimer++;
    } else {
      this.stuckTimer = 0;
    }
    this.lastX = self.x;
    this.lastY = self.y;

    // Hesitation: randomly freeze (looks like a confused player)
    if (this.difficulty.hesitationChance > 0 && Math.random() < this.difficulty.hesitationChance) {
      return { ...NO_INPUT };
    }

    // Compute ideal input
    const ideal = this.computeIdealInput(self, state, arena);

    // Push through reaction buffer
    this.reactionBuffer.push(ideal);
    const delayed = this.reactionBuffer.shift() ?? ideal;

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
        this.jumpCooldown = 20; // prevent spamming — bots should walk more
      }
    }

    return delayed;
  }

  private computeIdealInput(self: Player, state: MatchState, arena: Arena): InputState {
    // If stuck, try random escape
    if (this.stuckTimer > 60) {
      this.stuckTimer = 0;
      return {
        left: Math.random() > 0.5,
        right: Math.random() > 0.5,
        jump: true,
        down: false,
      };
    }

    // Build awareness snapshot
    const awareness = buildAwareness(self, state, arena, this.difficulty.awarenessRadius);

    // Search pause: when nothing is in immediate radius, pause briefly before roaming
    const nothingNearby = !awareness.nearestEnemy && !awareness.stompTarget && !awareness.stompThreat
      && !awareness.nearestCarrot && awareness.airborneAbove.length === 0 && awareness.nearbyHazards.length === 0;
    if (nothingNearby && !this.wasIdle) {
      // Just transitioned to idle — start a search pause
      this.searchTimer = 30 + Math.floor(Math.random() * 50); // 0.5-1.3s
      this.wasIdle = true;
    }
    if (!nothingNearby) {
      this.wasIdle = false;
      this.searchTimer = 0;
    }
    if (this.searchTimer > 0) {
      this.searchTimer--;
      return { left: false, right: false, jump: false, down: false };
    }

    // Wolf special: if targeting leader, override nearest enemy with score leader
    if (this.personality.targetLeader && awareness.nearestEnemy) {
      const leader = state.players
        .filter(p => p.id !== self.id && p.active && p.state !== 'splat' && p.state !== 'respawning')
        .sort((a, b) => b.score - a.score)[0];
      if (leader && leader.score > self.score) {
        const dx = leader.x - self.x;
        const dy = leader.y - self.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        awareness.nearestEnemy = { x: leader.x, y: leader.y, vx: leader.vx, vy: leader.vy, dx, dy, dist, score: leader.score };
      }
    }

    // Evaluate utility scores
    const scores = evaluateActions(awareness, this.personality);

    // Add chaos noise based on personality
    if (this.personality.chaosAffinity > 0) {
      const noise = this.personality.chaosAffinity * 0.3;
      scores.moveLeft += (Math.random() - 0.5) * noise;
      scores.moveRight += (Math.random() - 0.5) * noise;
      scores.jump += (Math.random() - 0.5) * noise * 0.5;
      scores.drop += (Math.random() - 0.5) * noise * 0.3;
    }

    // Convert scores to booleans
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
      jump: Math.random() > 0.92, // rarely jump randomly
      down: Math.random() > 0.95,
    };
  }
}
