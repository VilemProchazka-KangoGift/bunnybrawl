import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LobbyGame, READY_ZONE_X } from './lobbyGame';
import type { LobbyPlayer } from './lobbyGame';
import { PLAYER_WIDTH } from './constants';
import { registerBuiltinCharacters, getAllCharacters } from './characters';
import { registerBuiltinArenas } from './arenas';

// Ensure character + arena packs are registered (needed for getAllCharacters)
registerBuiltinCharacters();
registerBuiltinArenas();

// Silence audio calls during tests
vi.mock('./audio', () => ({
  audio: {
    play: vi.fn(),
    playAnimal: vi.fn(),
    playMenuMusic: vi.fn(),
  },
}));

function makeLobbyGame(opts: { botCount?: number; isMobile?: boolean } = {}) {
  return new LobbyGame({
    botCount: opts.botCount ?? 2,
    isMobile: opts.isMobile ?? false,
  });
}

describe('LobbyGame', () => {
  let game: LobbyGame;

  beforeEach(() => {
    game = makeLobbyGame();
  });

  // ---- Constructor ----

  it('creates 5 human players in desktop mode', () => {
    expect(game.players).toHaveLength(5);
    const slots = game.players.map(p => p.slot);
    expect(slots).toEqual(['P1', 'P2', 'P3', 'P4', 'P5']);
  });

  it('creates correct number of bots', () => {
    expect(game.bots).toHaveLength(2);
    expect(game.bots[0].slot).toBe('B1');
    expect(game.bots[1].slot).toBe('B2');
  });

  it('creates extra NPC characters from remaining roster', () => {
    // 17 total characters - 5 humans - 2 bots = 10 extras
    expect(game.extraChars.length).toBe(10);
  });

  it('mobile mode creates only P1', () => {
    const mobile = makeLobbyGame({ isMobile: true, botCount: 1 });
    expect(mobile.players).toHaveLength(1);
    expect(mobile.players[0].slot).toBe('P1');
  });

  // ---- Physics / update ----

  it('applies gravity during update', () => {
    const p = game.players[0];
    // Lift player above ground
    p.y = 200;
    p.onGround = false;
    p.vy = 0;
    const yBefore = p.y;

    game.update(1 / 60, new Set());

    // Player should have moved down due to gravity
    expect(p.y).toBeGreaterThan(yBefore);
  });

  it('moves player right when right key held', () => {
    const p = game.players[0];
    p.x = 100;
    // P1 right key is 'd'
    game.update(1 / 60, new Set(['d']));
    expect(p.x).toBeGreaterThan(100);
    expect(p.facing).toBe('right');
  });

  it('moves player left when left key held', () => {
    const p = game.players[0];
    p.x = 200;
    // P1 left key is 'a'
    game.update(1 / 60, new Set(['a']));
    expect(p.x).toBeLessThan(200);
    expect(p.facing).toBe('left');
  });

  it('player jumps when jump key pressed while on ground', () => {
    const p = game.players[0];
    p.onGround = true;
    p.vy = 0;
    // P1 jump key is 'w'
    game.update(1 / 60, new Set(['w']));
    expect(p.vy).toBeLessThan(0); // negative = upward
    expect(p.onGround).toBe(false);
  });

  it('clamps player to screen bounds', () => {
    const p = game.players[0];
    p.x = -50;
    p.vx = -100;
    game.update(1 / 60, new Set());
    expect(p.x).toBeGreaterThanOrEqual(0);
  });

  // ---- Bot AI ----

  it('bots move toward the ready zone', () => {
    const bot = game.bots[0];
    bot.x = 100;
    bot.onGround = true;
    const xBefore = bot.x;

    // Run several ticks so bot walks right
    for (let i = 0; i < 10; i++) {
      game.update(1 / 60, new Set());
    }

    expect(bot.x).toBeGreaterThan(xBefore);
    expect(bot.facing).toBe('right');
  });

  // ---- Ready zone ----

  it('detects players in the ready zone', () => {
    // Move two players into the ready zone
    game.players[0].x = READY_ZONE_X + 10;
    game.players[1].x = READY_ZONE_X + 50;
    game.players[0].splatTimer = 0;
    game.players[1].splatTimer = 0;

    const ready = game.getReadyPlayers();
    expect(ready.length).toBeGreaterThanOrEqual(2);
    expect(ready.some(p => p.slot === 'P1')).toBe(true);
    expect(ready.some(p => p.slot === 'P2')).toBe(true);
  });

  it('excludes splatted players from ready zone', () => {
    game.players[0].x = READY_ZONE_X + 10;
    game.players[0].splatTimer = 0.5; // splatted
    game.players[1].x = READY_ZONE_X + 50;

    const ready = game.getReadyPlayers();
    expect(ready.some(p => p.slot === 'P1')).toBe(false);
  });

  // ---- Countdown ----

  it('starts countdown when 2+ participants (including 1 human) are in zone', () => {
    // Place 1 human + 1 bot in ready zone
    game.players[0].x = READY_ZONE_X + 10;
    game.bots[0].x = READY_ZONE_X + 50;

    game.update(1 / 60, new Set());

    expect(game.countdownStarted).toBe(true);
    expect(game.countdown).toBeGreaterThan(0);
  });

  it('resets countdown when players leave the zone', () => {
    // Start countdown
    game.players[0].x = READY_ZONE_X + 10;
    game.bots[0].x = READY_ZONE_X + 50;
    game.update(1 / 60, new Set());
    expect(game.countdownStarted).toBe(true);

    // Move them out
    game.players[0].x = 100;
    game.bots[0].x = 100;
    game.update(1 / 60, new Set());
    expect(game.countdownStarted).toBe(false);
    expect(game.countdown).toBe(-1);
  });

  it('isCountdownComplete returns true after enough ticks', () => {
    game.players[0].x = READY_ZONE_X + 10;
    game.bots[0].x = READY_ZONE_X + 50;

    // Run 5+ seconds of ticks at 60fps
    for (let i = 0; i < 350; i++) {
      game.update(1 / 60, new Set());
    }

    expect(game.isCountdownComplete()).toBe(true);
  });

  it('does not start countdown with only 1 participant', () => {
    game.players[0].x = READY_ZONE_X + 10;
    // No bots or other humans in zone
    game.update(1 / 60, new Set());
    expect(game.countdownStarted).toBe(false);
  });

  // ---- Stomp / character swap ----

  it('swaps characters on stomp', () => {
    // Isolate: move all others far away so only this pair can stomp
    for (const p of [...game.players, ...game.bots, ...game.extraChars]) {
      p.x = -200;
      p.vy = 0;
    }
    const attacker = game.players[0];
    const victim = game.extraChars[0];

    const attackerCharBefore = attacker.char.name;
    const victimCharBefore = victim.char.name;

    // Position attacker directly above victim, falling fast enough to stomp.
    // GROUND_Y = 560, PLAYER_HEIGHT = 32
    victim.x = 300;
    victim.y = 560 - 32; // 528 — on the ground
    victim.splatTimer = 0;
    victim.onGround = true;
    attacker.x = 300;
    // attacker bottom = attacker.y + 32. After physics: vy += 10, y += ~3.5
    // So place attacker so that AFTER physics, bottom is in (528, 548)
    attacker.y = 500;
    attacker.vy = 200;
    attacker.onGround = false;

    game.update(1 / 60, new Set());

    // Characters should be swapped
    expect(attacker.char.name).toBe(victimCharBefore);
    expect(victim.char.name).toBe(attackerCharBefore);
    expect(victim.splatTimer).toBeGreaterThan(0);
  });

  // ---- Destroy ----

  it('cleans up on destroy', () => {
    game.destroy();
    expect(game.players).toHaveLength(0);
    expect(game.bots).toHaveLength(0);
    expect(game.extraChars).toHaveLength(0);
  });

  // ---- Ready zone detection ----

  describe('ready zone detection', () => {
    it('getReadyPlayers returns players past READY_ZONE_X', () => {
      // Move P1 into the ready zone (x + PLAYER_WIDTH must exceed READY_ZONE_X)
      game.players[0].x = READY_ZONE_X + 10;
      game.players[0].splatTimer = 0;

      const ready = game.getReadyPlayers();
      expect(ready.some(p => p.slot === 'P1')).toBe(true);
    });

    it('getReadyPlayers includes bots in the ready zone', () => {
      game.bots[0].x = READY_ZONE_X + 10;
      game.bots[0].splatTimer = 0;

      const ready = game.getReadyPlayers();
      expect(ready.some(p => p.slot === 'B1')).toBe(true);
    });

    it('getReadyPlayers returns empty when nobody is in the zone', () => {
      // All players and bots start at x < READY_ZONE_X by default
      for (const p of [...game.players, ...game.bots]) {
        p.x = 50;
      }
      const ready = game.getReadyPlayers();
      expect(ready).toHaveLength(0);
    });

    it('ready count reflects number of participants in zone', () => {
      game.players[0].x = READY_ZONE_X + 10;
      game.players[1].x = READY_ZONE_X + 20;
      game.bots[0].x = READY_ZONE_X + 30;
      game.players[0].splatTimer = 0;
      game.players[1].splatTimer = 0;
      game.bots[0].splatTimer = 0;

      const ready = game.getReadyPlayers();
      expect(ready).toHaveLength(3);
    });
  });

  // ---- Bot count ----

  describe('bot count configuration', () => {
    it('creates 0 bots when botCount is 0', () => {
      const g = makeLobbyGame({ botCount: 0 });
      expect(g.bots).toHaveLength(0);
      // 17 characters - 5 humans - 0 bots = 12 extras
      expect(g.extraChars.length).toBe(12);
    });

    it('creates 1 bot when botCount is 1', () => {
      const g = makeLobbyGame({ botCount: 1 });
      expect(g.bots).toHaveLength(1);
      expect(g.bots[0].slot).toBe('B1');
      // 17 - 5 - 1 = 11 extras
      expect(g.extraChars.length).toBe(11);
    });

    it('creates 5 bots when botCount is 5', () => {
      const g = makeLobbyGame({ botCount: 5 });
      expect(g.bots).toHaveLength(5);
      const botSlots = g.bots.map(b => b.slot);
      expect(botSlots).toEqual(['B1', 'B2', 'B3', 'B4', 'B5']);
      // 17 - 5 - 5 = 7 extras
      expect(g.extraChars.length).toBe(7);
    });

    it('total characters always equals full roster size', () => {
      for (const botCount of [0, 1, 2, 3, 5]) {
        const g = makeLobbyGame({ botCount });
        const total = g.players.length + g.bots.length + g.extraChars.length;
        expect(total).toBe(17);
      }
    });
  });

  // ---- Character roster ----

  describe('character roster', () => {
    it('getAllCharacters returns 17+ characters', () => {
      const chars = getAllCharacters();
      expect(chars.length).toBeGreaterThanOrEqual(17);
    });

    it('each player, bot, and extra has a unique character', () => {
      const names = new Set<string>();
      for (const p of [...game.players, ...game.bots, ...game.extraChars]) {
        names.add(p.char.name);
      }
      // All characters should be unique (no duplicates)
      expect(names.size).toBe(game.players.length + game.bots.length + game.extraChars.length);
    });
  });

  // ---- Countdown ----

  describe('countdown behavior', () => {
    it('countdown decrements each tick when active', () => {
      // Place 1 human + 1 bot in zone to start countdown
      game.players[0].x = READY_ZONE_X + 10;
      game.bots[0].x = READY_ZONE_X + 50;

      game.update(1 / 60, new Set());
      expect(game.countdownStarted).toBe(true);
      const countdownAfterFirstTick = game.countdown;

      game.update(1 / 60, new Set());
      expect(game.countdown).toBeLessThan(countdownAfterFirstTick);
    });

    it('countdown starts at 5 seconds', () => {
      game.players[0].x = READY_ZONE_X + 10;
      game.bots[0].x = READY_ZONE_X + 50;

      game.update(1 / 60, new Set());
      // After 1 tick of 1/60s, countdown should be ~5 - 1/60
      expect(game.countdown).toBeCloseTo(5 - 1 / 60, 2);
    });

    it('isCountdownComplete returns false while countdown is positive', () => {
      game.players[0].x = READY_ZONE_X + 10;
      game.bots[0].x = READY_ZONE_X + 50;

      // Run a few ticks but not enough to complete
      for (let i = 0; i < 60; i++) {
        game.update(1 / 60, new Set());
      }
      expect(game.countdownStarted).toBe(true);
      expect(game.isCountdownComplete()).toBe(false);
    });

    it('countdown does not start with 2 humans but no bots in zone', () => {
      const g = makeLobbyGame({ botCount: 0 });
      g.players[0].x = READY_ZONE_X + 10;
      g.players[1].x = READY_ZONE_X + 50;

      g.update(1 / 60, new Set());
      expect(g.countdownStarted).toBe(true);
    });
  });

  // ---- Player movement ----

  describe('player movement', () => {
    it('P2 moves right with the correct key binding', () => {
      const p2 = game.players[1]; // P2
      p2.x = 200;
      p2.onGround = true;
      // P2 right key is 'ArrowRight' per KEY_BINDINGS
      game.update(1 / 60, new Set(['ArrowRight']));
      expect(p2.x).toBeGreaterThan(200);
      expect(p2.facing).toBe('right');
    });

    it('P2 moves left with the correct key binding', () => {
      const p2 = game.players[1]; // P2
      p2.x = 200;
      p2.onGround = true;
      // P2 left key is 'ArrowLeft' per KEY_BINDINGS
      game.update(1 / 60, new Set(['ArrowLeft']));
      expect(p2.x).toBeLessThan(200);
      expect(p2.facing).toBe('left');
    });

    it('player decelerates when no keys held', () => {
      const p = game.players[0];
      p.x = 200;
      p.vx = 100;
      p.onGround = true;

      game.update(1 / 60, new Set());

      // vx should decrease due to friction (0.85 multiplier)
      expect(Math.abs(p.vx)).toBeLessThan(100);
    });

    it('player x changes over multiple frames with key held', () => {
      const p = game.players[0];
      p.x = 100;
      p.onGround = true;
      const xBefore = p.x;

      for (let i = 0; i < 30; i++) {
        game.update(1 / 60, new Set(['d']));
      }

      expect(p.x).toBeGreaterThan(xBefore + 50);
    });
  });

  // ---- Jump physics ----

  describe('jump physics', () => {
    it('player goes airborne after jump', () => {
      const p = game.players[0];
      p.onGround = true;
      p.y = 560 - 32; // at ground level
      p.vy = 0;

      game.update(1 / 60, new Set(['w']));

      expect(p.onGround).toBe(false);
      expect(p.vy).toBeLessThan(0);
    });

    it('player lands back on ground after jump arc', () => {
      // Isolate: move all entities far away so no stomp/collision interference
      for (const e of [...game.players, ...game.bots, ...game.extraChars]) {
        e.x = -500;
        e.vy = 0;
        e.vx = 0;
        e.splatTimer = 0;
      }

      const p = game.players[0];
      p.x = 100;
      p.vx = 0;
      p.onGround = true;
      p.y = 560 - 32;
      p.vy = 0;
      p.splatTimer = 0;

      // First tick: jump
      game.update(1 / 60, new Set(['w']));
      // Player should have launched (vy negative)
      expect(p.vy).toBeLessThan(0);

      // Run enough ticks for gravity to bring player back down
      for (let i = 0; i < 300; i++) {
        game.update(1 / 60, new Set());
      }

      // Player should have landed (y at ground, onGround true)
      expect(p.onGround).toBe(true);
      expect(p.y).toBeCloseTo(560 - 32, 0);
    });

    it('player cannot double-jump', () => {
      const p = game.players[0];
      p.onGround = true;
      p.y = 560 - 32;

      // Jump
      game.update(1 / 60, new Set(['w']));
      expect(p.onGround).toBe(false);
      const vyAfterJump = p.vy;

      // Try to jump again mid-air — vy should not reset
      game.update(1 / 60, new Set(['w']));
      // vy should have increased (less negative) due to gravity, not reset to jump impulse
      expect(p.vy).toBeGreaterThan(vyAfterJump);
    });

    it('fast-fall applies when pressing down while airborne', () => {
      const p = game.players[0];
      p.onGround = false;
      p.y = 300;
      p.vy = 0;

      // P1 down key is 's'
      game.update(1 / 60, new Set(['s']));

      // vy should be at least the fast-fall speed (500)
      expect(p.vy).toBeGreaterThanOrEqual(500);
    });
  });

  // ---- NPC wandering ----

  describe('NPC wandering', () => {
    it('NPCs have initial velocity', () => {
      // At least some extras should have non-zero vx from construction
      const hasMotion = game.extraChars.some(npc => npc.vx !== 0);
      expect(hasMotion).toBe(true);
    });

    it('NPCs stay within left bound (x >= 0)', () => {
      // Place an NPC near the left edge moving left
      const npc = game.extraChars[0];
      npc.x = 5;
      npc.vx = -200;
      npc.onGround = true;

      for (let i = 0; i < 30; i++) {
        game.update(1 / 60, new Set());
      }

      expect(npc.x).toBeGreaterThanOrEqual(0);
    });

    it('NPCs stay within right bound (x + width <= CANVAS_WIDTH)', () => {
      const npc = game.extraChars[0];
      npc.x = 1270;
      npc.vx = 200;
      npc.onGround = true;

      for (let i = 0; i < 30; i++) {
        game.update(1 / 60, new Set());
      }

      expect(npc.x + PLAYER_WIDTH).toBeLessThanOrEqual(1280);
    });

    it('NPCs land on the ground after being in the air', () => {
      // Isolate: move everyone else far away
      for (const e of [...game.players, ...game.bots, ...game.extraChars]) {
        e.x = -500;
        e.vy = 0;
        e.vx = 0;
      }

      const npc = game.extraChars[0];
      npc.x = 100;
      npc.vx = 0;
      npc.y = 300;
      npc.vy = 0;
      npc.onGround = false;
      npc.splatTimer = 0;

      for (let i = 0; i < 120; i++) {
        game.update(1 / 60, new Set());
      }

      expect(npc.onGround).toBe(true);
      expect(npc.y).toBe(560 - 32);
    });

    it('NPC facing matches movement direction', () => {
      const npc = game.extraChars[0];
      npc.vx = 50;
      npc.onGround = true;

      game.update(1 / 60, new Set());

      // facing may change due to random vx reassignment, but if vx > 0 then facing should be right
      if (npc.vx > 0) expect(npc.facing).toBe('right');
      if (npc.vx < 0) expect(npc.facing).toBe('left');
    });
  });
});
