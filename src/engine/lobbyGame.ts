// LobbyGame — lobby simulation orchestrator.
// Owns the lobby player state, NPC wandering, bot AI, physics, stomp/swap, and
// ready-zone countdown. Delegates rendering to lobbyRender.ts and bot AI to lobbyBots.ts.

import type { Arena, CharacterDef, CharacterSlot, MatchState, Player, PlayerSlot, InputState, WildlifeEntity } from './types';
import type { ThemeConfig } from './themes/types';
import { ALL_BOT_SLOTS, isBotSlot } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_WIDTH, PLAYER_HEIGHT, SQUASH_ON_CROUCH, SQUASH_DECAY_SPEED, IDLE_ANIM_INTERVAL } from './constants';
import { KEY_BINDINGS } from './input';
import { applyInput, applyGravity, movePlayer, collidePlatforms, updatePlayerState } from './physics';
import { isStomping } from './stomp';
import { getAllCharacters } from './characters';
import { audio } from './audio';
import { updateWildlife } from './gameLoop/cosmetics/environment';
import { createEmptyMatchState } from './gameLoop/initialState';
import { getArena, getTheme } from './arenas';
import { pickWeighted, randRange } from './themes/utils';
import {
  SLOTS, READY_ZONE_X, COUNTDOWN_SECONDS, GROUND_Y, LOBBY_DAY_CYCLE,
  LOBBY_GRAVITY, LOBBY_SPEED, LOBBY_JUMP,
  WALL_X,
} from './lobbyConstants';
import { botLobbyInput, wanderInput } from './lobbyBots';

export { READY_ZONE_X } from './lobbyConstants';

function makeLobbyPlayer(slot: PlayerSlot, char: CharacterDef, x: number, y: number): Player {
  return {
    id: slot,
    character: { ...char, slot },
    x, y, vx: 0, vy: 0,
    width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
    state: 'idle', facing: 'right',
    splatTimer: 0, respawnTimer: 0, invincibleTimer: 0,
    score: 0, active: true,
    animFrame: 0, animTimer: 0, fastFalling: false,
    fatTimer: 0, slowTimer: 0,
    squashScale: 1, squashTimer: 0, sideSquash: 1,
    afterimages: [], idleAnimTimer: 0,
    expression: 'normal', killStreak: 0,
    breathTimer: 0, springTrailTimer: 0,
    damageFlashSide: null, damageFlashTimer: 0, burnTimer: 0, hitstopTimer: 0,
    renderOffsetX: 0, renderOffsetY: 0, disconnected: false,
  };
}

function clampLobbyBounds(p: Player): void {
  // Horizontal clamp (NOT wrap — we don't want players teleporting across the canvas)
  if (p.x < 0) {
    if (p.vx < 0) p.sideSquash = 0.75;
    p.x = 0;
    p.vx = 0;
  } else if (p.x + p.width > CANVAS_WIDTH) {
    if (p.vx > 0) p.sideSquash = 0.75;
    p.x = CANVAS_WIDTH - p.width;
    p.vx = 0;
  }
  if (p.y < 0) {
    p.y = 0;
    if (p.vy < 0) p.vy = 0;
  }
}

/**
 * Build a minimal MatchState for the lobby — populated enough to satisfy
 * Renderer.renderFrame (which expects a full MatchState shape) but empty for
 * everything the lobby doesn't use (carrots, springs, thorns, gibs, hazards,
 * etc.). Callers update `players`, `wildlife`, `timeElapsed`, `dayPhase`
 * each frame; everything else stays as initialized here.
 */
function buildLobbyMatchState(theme: ThemeConfig): MatchState {
  // Initial wildlife — same loop shape as createInitialMatchState.
  const wildlife: WildlifeEntity[] = [];
  const wc = theme.wildlife;
  for (let i = 0; i < wc.count; i++) {
    const chosen = pickWeighted(wc.types);
    wildlife.push({
      type: chosen.type,
      x: chosen.type === 'bird' ? -50 - Math.random() * 100 : Math.random() * CANVAS_WIDTH,
      y: randRange(chosen.yRange) * CANVAS_HEIGHT,
      vx: randRange(chosen.speedRange),
      vy: 0,
      wingPhase: Math.random() * Math.PI * 2,
      color: chosen.colors[Math.floor(Math.random() * chosen.colors.length)],
    });
  }

  return { ...createEmptyMatchState(), wildlife };
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface LobbyGameConfig {
  botCount: number;
  isMobile: boolean;
}

export class LobbyGame {
  // Behavioral notes vs. pre-refactor lobby:
  // - Bot speed: all bots walk at LOBBY_SPEED (pre-refactor varied 119-200 px/s per slot).
  // - Stomp splat visual: X-eyed splat (drawPlayer → drawSplatCharacter). Was a flat ellipse.
  // - Character shadows: drawn under all entities (drawPlayer adds them). Was no shadow.
  players: Player[] = [];
  bots: Player[] = [];
  extraChars: Player[] = [];

  countdown = -1;
  countdownStarted = false;

  private readySoundPlayed = new Set<PlayerSlot>();

  // MatchState shim — built once in the constructor and mutated each frame so
  // rendering through the standard Renderer works without re-allocating the
  // state shape. `timeElapsed` doubles as our day-night clock.
  private _matchState: MatchState;
  private _renderEntities: Player[] = []; // reused by getMatchState() each call

  // Pre-allocated combined arrays (rebuilt in update, avoid per-frame spread)
  private _allLobby: Player[] = [];
  private _participants: Player[] = [];  // players + bots (no extras)
  private _extrasSet = new Set<Player>();

  // Ready-zone counts (computed in updateReadyZone, read by render)
  private _inZoneCount = 0;
  private _humanInZoneCount = 0;
  private _botInZoneCount = 0;

  constructor(config: LobbyGameConfig) {
    const botCount = config.botCount;
    const botSlots = ALL_BOT_SLOTS.slice(0, botCount);
    this._matchState = buildLobbyMatchState(getTheme('lobby'));

    // On mobile, only spawn P1 (touch player)
    const activeSlots = config.isMobile ? (['P1'] as CharacterSlot[]) : SLOTS;

    // Randomly assign characters to players
    const shuffled = shuffle([...getAllCharacters()]);
    const assigned = shuffled.slice(0, activeSlots.length);
    const botAssigned = shuffled.slice(activeSlots.length, activeSlots.length + botCount);
    const extras = shuffled.slice(activeSlots.length + botCount);

    this.players = activeSlots.map((slot, i) =>
      makeLobbyPlayer(slot, assigned[i], 40 + i * 90, GROUND_Y - PLAYER_HEIGHT)
    );

    this.bots = botSlots.map((slot, i) =>
      makeLobbyPlayer(slot, botAssigned[i], 40 + (SLOTS.length + i) * 60, GROUND_Y - PLAYER_HEIGHT)
    );

    // NPC extras all carry a dummy id='P1'. Filter via `_extrasSet.has(entity)`, NEVER by id.
    this.extraChars = extras.map((ch) => {
      const p = makeLobbyPlayer('P1' as CharacterSlot, ch, 40 + Math.random() * (WALL_X - 80), GROUND_Y - PLAYER_HEIGHT);
      p.vx = (Math.random() - 0.5) * 60;
      p.facing = Math.random() > 0.5 ? 'right' : 'left';
      return p;
    });
  }

  /**
   * Advance the lobby simulation by `dt` seconds.
   * @param dt frame delta in seconds (clamped by caller)
   * @param keys currently held keyboard keys
   * @param touchInput optional P1 touch input (mobile)
   */
  update(dt: number, keys: Set<string>, touchInput?: InputState): void {
    // Rebuild cached combined arrays (avoids per-frame spread allocations)
    this._allLobby.length = 0;
    for (const p of this.players) this._allLobby.push(p);
    for (const b of this.bots) this._allLobby.push(b);
    for (const e of this.extraChars) this._allLobby.push(e);

    this._participants.length = 0;
    for (const p of this.players) this._participants.push(p);
    for (const b of this.bots) this._participants.push(b);

    this._extrasSet.clear();
    for (const e of this.extraChars) this._extrasSet.add(e);

    const step = (p: Player, input: InputState): void => {
      if (p.splatTimer > 0) {
        p.splatTimer = Math.max(0, p.splatTimer - dt);
        if (p.splatTimer === 0 && p.state === 'splat') p.state = 'idle';
        return;
      }

      applyInput(p, input, dt, LOBBY_SPEED, 1500 /* friction */, LOBBY_JUMP);

      // Passive facing sync — applyInput only sets facing on directional input;
      // coast velocity (bumps, stomps, initial NPC vx) needs its own sync.
      if (!input.left && !input.right) {
        if (p.vx > 0) p.facing = 'right';
        else if (p.vx < 0) p.facing = 'left';
      }

      applyGravity(p, dt, LOBBY_GRAVITY, 800);
      movePlayer(p, dt);
      collidePlatforms(p, this.getArena().platforms);
      clampLobbyBounds(p);
      updatePlayerState(p);

      // Squash decay (engine decays these inside GameLoop with fround — lobby doesn't need determinism)
      if (p.squashScale !== 1) {
        p.squashScale += (1 - p.squashScale) * SQUASH_DECAY_SPEED * dt;
        if (Math.abs(p.squashScale - 1) < 0.02) p.squashScale = 1;
      }
      if (p.sideSquash !== 1) {
        p.sideSquash += (1 - p.sideSquash) * SQUASH_DECAY_SPEED * dt;
        if (Math.abs(p.sideSquash - 1) < 0.02) p.sideSquash = 1;
      }

      // Anim frame tick
      if (Math.abs(p.vx) > 10) {
        p.animTimer += dt;
        if (p.animTimer > 0.12) { p.animTimer = 0; p.animFrame = (p.animFrame + 1) % 4; }
      }

      if (p.state === 'idle') {
        p.idleAnimTimer += dt;
        if (p.idleAnimTimer >= IDLE_ANIM_INTERVAL) p.idleAnimTimer = 0;
      } else {
        p.idleAnimTimer = 0;
      }

      // Lobby-specific: crouch-on-ground squat
      if (input.down && p.state !== 'airborne') p.squashScale = SQUASH_ON_CROUCH;
    };

    for (const p of this.players) {
      let input: InputState;
      if (touchInput && p.id === 'P1') {
        input = touchInput;
      } else {
        const bindings = KEY_BINDINGS[p.id as CharacterSlot];
        input = {
          left: keys.has(bindings.left),
          right: keys.has(bindings.right),
          jump: keys.has(bindings.jump),
          down: keys.has(bindings.down),
        };
      }
      step(p, input);
    }

    for (const npc of this.extraChars) {
      step(npc, wanderInput(npc, this.extraChars));
    }

    for (const bot of this.bots) {
      step(bot, botLobbyInput(bot));
    }

    this.processStomps(this._allLobby);
    this.updateReadyZone(dt);

    this._matchState.timeElapsed += dt;
    this._matchState.dayPhase = (this._matchState.timeElapsed / LOBBY_DAY_CYCLE) % 1;
    updateWildlife(this._matchState, dt);
  }

  /**
   * Return a MatchState compatible with Renderer.renderFrame. Players list
   * combines humans + bots + NPCs in render order (NPCs back, players front).
   */
  getMatchState(): MatchState {
    this._renderEntities.length = 0;
    for (const e of this.extraChars) this._renderEntities.push(e);
    for (const b of this.bots) this._renderEntities.push(b);
    for (const p of this.players) this._renderEntities.push(p);
    this._matchState.players = this._renderEntities;
    return this._matchState;
  }

  /** Lobby arena (registry-backed). Use for canvas mounts that need the platform layout. */
  getArena(): Arena {
    return getArena('lobby');
  }

  /** Read-only ready-zone counts for HUD overlay. */
  getReadyZoneCounts(): { inZone: number; humans: number; bots: number } {
    return {
      inZone: this._inZoneCount,
      humans: this._humanInZoneCount,
      bots: this._botInZoneCount,
    };
  }

  private processStomps(allLobby: Player[]): void {
    for (const attacker of this._participants) {
      if (attacker.splatTimer > 0) continue;
      const attackerIsBot = isBotSlot(attacker.id);

      for (const victim of allLobby) {
        if (victim === attacker) continue;
        if (victim.splatTimer > 0) continue;
        if (attackerIsBot && !this._extrasSet.has(victim)) continue;

        if (isStomping(attacker, victim)) {
          const tempChar = attacker.character;
          attacker.character = { ...victim.character, slot: attacker.id };
          victim.character = { ...tempChar, slot: victim.id };
          victim.splatTimer = 0.8;
          victim.state = 'splat';
          attacker.vy = -300;
          audio.play('stomp');

          const isNPC = this._extrasSet.has(victim);
          if (isNPC) {
            let bestX = 40;
            let bestDist = 0;
            for (let attempt = 0; attempt < 10; attempt++) {
              const tryX = 20 + Math.random() * (WALL_X - 80);
              const dx = Math.abs(tryX - attacker.x);
              if (dx > bestDist) { bestDist = dx; bestX = tryX; }
            }
            if (bestDist < 200 && WALL_X > 200) bestX = attacker.x > WALL_X / 2 ? 40 : WALL_X - 60;
            victim.x = bestX;
            victim.y = GROUND_Y - PLAYER_HEIGHT;
            victim.vx = 0;
            victim.vy = 0;
            victim.state = 'idle';
          }
        }
      }
    }
  }

  private updateReadyZone(dt: number): void {
    this._inZoneCount = 0;
    this._humanInZoneCount = 0;
    this._botInZoneCount = 0;
    for (const p of this._participants) {
      if (p.x + PLAYER_WIDTH > READY_ZONE_X && p.splatTimer <= 0) {
        this._inZoneCount++;
        if (isBotSlot(p.id)) this._botInZoneCount++;
        else this._humanInZoneCount++;

        if (!this.readySoundPlayed.has(p.id)) {
          this.readySoundPlayed.add(p.id);
          audio.playAnimal(p.character.name);
        }
      } else {
        // Remove players who left the zone so they can trigger again if they re-enter
        this.readySoundPlayed.delete(p.id);
      }
    }

    // Need at least 1 human + total 2 participants to start countdown
    if (this._inZoneCount >= 2 && this._humanInZoneCount >= 1 && !this.countdownStarted) {
      this.countdownStarted = true;
      this.countdown = COUNTDOWN_SECONDS;
    }
    if (this._inZoneCount < 2 || this._humanInZoneCount < 1) {
      this.countdownStarted = false;
      this.countdown = -1;
    }

    if (this.countdownStarted) {
      this.countdown -= dt;
    }
  }

  /** All participants (human + bot) currently in the ready zone and not splatted. */
  getReadyPlayers(): Player[] {
    // Not a hot path — called once at countdown end. Iterate source arrays
    // directly so this works even before the first update() call.
    const result: Player[] = [];
    for (const p of this.players) {
      if (p.x + PLAYER_WIDTH > READY_ZONE_X && p.splatTimer <= 0) result.push(p);
    }
    for (const b of this.bots) {
      if (b.x + PLAYER_WIDTH > READY_ZONE_X && b.splatTimer <= 0) result.push(b);
    }
    return result;
  }

  isCountdownComplete(): boolean {
    return this.countdownStarted && this.countdown <= 0;
  }

  destroy(): void {
    this.players = [];
    this.bots = [];
    this.extraChars = [];
    this.readySoundPlayed.clear();
  }
}
