import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LobbyGame, READY_ZONE_X } from './lobbyGame';
import type { LobbyPlayer } from './lobbyGame';
import { PLAYER_WIDTH } from './constants';
import { registerBuiltinCharacters } from './characters';
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
});
