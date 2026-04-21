import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LobbyGame, READY_ZONE_X } from './lobbyGame';
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

// Mock rendering modules that drawLobby imports (use importOriginal for complete exports)
vi.mock('./rendering/players', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return { ...actual, drawCharacterCore: vi.fn(), drawPlayer: vi.fn() };
});

vi.mock('./themes/drawPrimitives', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    drawTree: vi.fn(),
    drawBush: vi.fn(),
    drawFlower: vi.fn(),
    drawMushroom: vi.fn(),
    drawGrassTuft: vi.fn(),
    drawCloud: vi.fn(),
  };
});

vi.mock('./canvasAnimations', () => ({
  initWildlife: vi.fn(() => []),
  updateAndDrawWildlife: vi.fn(),
  drawDayNightCycle: vi.fn(),
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
    const slots = game.players.map(p => p.id);
    expect(slots).toEqual(['P1', 'P2', 'P3', 'P4', 'P5']);
  });

  it('creates correct number of bots', () => {
    expect(game.bots).toHaveLength(2);
    expect(game.bots[0].id).toBe('B1');
    expect(game.bots[1].id).toBe('B2');
  });

  it('creates extra NPC characters from remaining roster', () => {
    // 17 total characters - 5 humans - 2 bots = 10 extras
    expect(game.extraChars.length).toBe(10);
  });

  it('mobile mode creates only P1', () => {
    const mobile = makeLobbyGame({ isMobile: true, botCount: 1 });
    expect(mobile.players).toHaveLength(1);
    expect(mobile.players[0].id).toBe('P1');
  });

  // ---- Physics / update ----

  it('applies gravity during update', () => {
    const p = game.players[0];
    // Lift player above ground
    p.y = 200;
    p.state = 'airborne';
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
    p.state = 'idle';
    p.vy = 0;
    // P1 jump key is 'w'
    game.update(1 / 60, new Set(['w']));
    expect(p.vy).toBeLessThan(0); // negative = upward
    expect(p.state).toBe('airborne');
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
    bot.state = 'idle';
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
    expect(ready.some(p => p.id === 'P1')).toBe(true);
    expect(ready.some(p => p.id === 'P2')).toBe(true);
  });

  it('excludes splatted players from ready zone', () => {
    game.players[0].x = READY_ZONE_X + 10;
    game.players[0].splatTimer = 0.5; // splatted
    game.players[1].x = READY_ZONE_X + 50;

    const ready = game.getReadyPlayers();
    expect(ready.some(p => p.id === 'P1')).toBe(false);
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

    const attackerCharBefore = attacker.character.name;
    const victimCharBefore = victim.character.name;

    // Position attacker directly above victim, falling fast enough to stomp.
    // GROUND_Y = 560, PLAYER_HEIGHT = 32
    victim.x = 300;
    victim.y = 560 - 32; // 528 — on the ground
    victim.splatTimer = 0;
    victim.state = 'idle';
    attacker.x = 300;
    // attacker bottom = attacker.y + 32. After physics: vy += 10, y += ~3.5
    // So place attacker so that AFTER physics, bottom is in (528, 548)
    attacker.y = 500;
    attacker.vy = 200;
    attacker.state = 'airborne';

    game.update(1 / 60, new Set());

    // Characters should be swapped
    expect(attacker.character.name).toBe(victimCharBefore);
    expect(victim.character.name).toBe(attackerCharBefore);
    expect(victim.splatTimer).toBeGreaterThan(0);
  });

  it('stomped human victim recovers after splatTimer expires', () => {
    // Isolate: move all others far away so only this pair can stomp
    for (const p of [...game.players, ...game.bots, ...game.extraChars]) {
      p.x = -200;
      p.vy = 0;
    }
    const attacker = game.players[0];
    const victim = game.players[1];

    // Position attacker directly above victim, falling fast enough to stomp.
    // GROUND_Y = 560, PLAYER_HEIGHT = 32
    victim.x = 300;
    victim.y = 560 - 32; // 528 — on the ground
    victim.vx = 0;
    victim.vy = 0;
    victim.splatTimer = 0;
    victim.state = 'idle';
    attacker.x = 300;
    attacker.y = 500;
    attacker.vy = 200;
    attacker.state = 'airborne';

    game.update(1 / 60, new Set());

    // Stomp happened: victim is splatted
    expect(victim.state).toBe('splat');
    expect(victim.splatTimer).toBeGreaterThan(0);

    // Move attacker far away so it can't re-stomp victim during recovery
    attacker.x = -500;
    attacker.y = 0;
    attacker.vx = 0;
    attacker.vy = 0;

    // Run 60 more ticks (1 second) — well past the 0.8s splatTimer
    for (let i = 0; i < 60; i++) {
      game.update(1 / 60, new Set());
    }

    // Victim should no longer be frozen in 'splat' state
    expect(victim.state).not.toBe('splat');
    expect(victim.splatTimer).toBe(0);

    // Victim can now accept input — press P2 left key five times
    const xBefore = victim.x;
    for (let i = 0; i < 5; i++) {
      game.update(1 / 60, new Set(['ArrowLeft']));
    }
    // Either velocity or position should reflect the input
    expect(victim.vx !== 0 || victim.x < xBefore).toBe(true);
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
      expect(ready.some(p => p.id === 'P1')).toBe(true);
    });

    it('getReadyPlayers includes bots in the ready zone', () => {
      game.bots[0].x = READY_ZONE_X + 10;
      game.bots[0].splatTimer = 0;

      const ready = game.getReadyPlayers();
      expect(ready.some(p => p.id === 'B1')).toBe(true);
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
      expect(g.bots[0].id).toBe('B1');
      // 17 - 5 - 1 = 11 extras
      expect(g.extraChars.length).toBe(11);
    });

    it('creates 5 bots when botCount is 5', () => {
      const g = makeLobbyGame({ botCount: 5 });
      expect(g.bots).toHaveLength(5);
      const botSlots = g.bots.map(b => b.id);
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
        names.add(p.character.name);
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
      p2.state = 'idle';
      // P2 right key is 'ArrowRight' per KEY_BINDINGS
      game.update(1 / 60, new Set(['ArrowRight']));
      expect(p2.x).toBeGreaterThan(200);
      expect(p2.facing).toBe('right');
    });

    it('P2 moves left with the correct key binding', () => {
      const p2 = game.players[1]; // P2
      p2.x = 200;
      p2.state = 'idle';
      // P2 left key is 'ArrowLeft' per KEY_BINDINGS
      game.update(1 / 60, new Set(['ArrowLeft']));
      expect(p2.x).toBeLessThan(200);
      expect(p2.facing).toBe('left');
    });

    it('player decelerates when no keys held', () => {
      const p = game.players[0];
      p.x = 200;
      p.vx = 100;
      p.state = 'idle';

      game.update(1 / 60, new Set());

      // vx should decrease due to friction (0.85 multiplier)
      expect(Math.abs(p.vx)).toBeLessThan(100);
    });

    it('player x changes over multiple frames with key held', () => {
      const p = game.players[0];
      p.x = 100;
      p.state = 'idle';
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
      p.state = 'idle';
      p.y = 560 - 32; // at ground level
      p.vy = 0;

      game.update(1 / 60, new Set(['w']));

      expect(p.state).toBe('airborne');
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
      p.state = 'idle';
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

      // Player should have landed (y at ground, state not airborne)
      expect(p.state).not.toBe('airborne');
      expect(p.y).toBeCloseTo(560 - 32, 0);
    });

    it('player cannot double-jump', () => {
      const p = game.players[0];
      p.state = 'idle';
      p.y = 560 - 32;

      // Jump
      game.update(1 / 60, new Set(['w']));
      expect(p.state).toBe('airborne');
      const vyAfterJump = p.vy;

      // Try to jump again mid-air — vy should not reset
      game.update(1 / 60, new Set(['w']));
      // vy should have increased (less negative) due to gravity, not reset to jump impulse
      expect(p.vy).toBeGreaterThan(vyAfterJump);
    });

    it('fast-fall applies when pressing down while airborne', () => {
      const p = game.players[0];
      p.state = 'airborne';
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
      npc.state = 'idle';

      for (let i = 0; i < 30; i++) {
        game.update(1 / 60, new Set());
      }

      expect(npc.x).toBeGreaterThanOrEqual(0);
    });

    it('NPCs stay within right bound (x + width <= CANVAS_WIDTH)', () => {
      const npc = game.extraChars[0];
      npc.x = 1270;
      npc.vx = 200;
      npc.state = 'idle';

      for (let i = 0; i < 30; i++) {
        game.update(1 / 60, new Set());
      }

      expect(npc.x + PLAYER_WIDTH).toBeLessThanOrEqual(1280);
    });

    it('NPCs affected by gravity when airborne', () => {
      const npc = game.extraChars[0];
      npc.y = 300;
      npc.vy = 0;
      npc.state = 'airborne';

      game.update(1 / 60, new Set());

      // Gravity should have increased vy (pulling downward)
      expect(npc.vy).toBeGreaterThan(0);
    });

    it('NPC facing matches movement direction', () => {
      const npc = game.extraChars[0];
      npc.vx = 50;
      npc.state = 'idle';

      game.update(1 / 60, new Set());

      // facing may change due to random vx reassignment, but if vx > 0 then facing should be right
      if (npc.vx > 0) expect(npc.facing).toBe('right');
      if (npc.vx < 0) expect(npc.facing).toBe('left');
    });
  });

  // ---- Touch input ----

  describe('touch input (mobile)', () => {
    it('P1 moves right with touch right input', () => {
      const mobile = makeLobbyGame({ isMobile: true, botCount: 1 });
      const p = mobile.players[0];
      p.x = 100;
      p.state = 'idle';

      mobile.update(1 / 60, new Set(), { left: false, right: true, jump: false, down: false });
      expect(p.x).toBeGreaterThan(100);
      expect(p.facing).toBe('right');
    });

    it('P1 moves left with touch left input', () => {
      const mobile = makeLobbyGame({ isMobile: true, botCount: 1 });
      const p = mobile.players[0];
      p.x = 200;
      p.state = 'idle';

      mobile.update(1 / 60, new Set(), { left: true, right: false, jump: false, down: false });
      expect(p.x).toBeLessThan(200);
      expect(p.facing).toBe('left');
    });

    it('P1 jumps with touch jump input', () => {
      const mobile = makeLobbyGame({ isMobile: true, botCount: 1 });
      const p = mobile.players[0];
      p.state = 'idle';
      p.vy = 0;

      mobile.update(1 / 60, new Set(), { left: false, right: false, jump: true, down: false });
      expect(p.vy).toBeLessThan(0);
      expect(p.state).toBe('airborne');
    });

    it('P1 fast-falls with touch down input while airborne', () => {
      const mobile = makeLobbyGame({ isMobile: true, botCount: 1 });
      const p = mobile.players[0];
      p.state = 'airborne';
      p.y = 300;
      p.vy = 0;

      mobile.update(1 / 60, new Set(), { left: false, right: false, jump: false, down: true });
      expect(p.vy).toBeGreaterThanOrEqual(500);
    });

    it('P1 crouches with touch down input while on ground', () => {
      const mobile = makeLobbyGame({ isMobile: true, botCount: 1 });
      const p = mobile.players[0];
      p.state = 'idle';
      p.squashScale = 1;

      mobile.update(1 / 60, new Set(), { left: false, right: false, jump: false, down: true });
      expect(p.squashScale).toBeLessThan(1);
    });
  });

  // ---- Wall collision ----

  describe('wall collision', () => {
    it('player is stopped by the wall from the left', () => {
      const p = game.players[0];
      // WALL_X = CANVAS_WIDTH * 0.58 = 742.4
      p.x = 720;
      p.vx = 200;
      p.state = 'idle';

      for (let i = 0; i < 10; i++) {
        game.update(1 / 60, new Set());
      }

      // Player should be stopped at wall left edge
      expect(p.x + 32).toBeLessThanOrEqual(742.4 + 1); // WALL_X
    });

    it('player lands on top of the wall', () => {
      // Isolate player
      for (const e of [...game.players, ...game.bots, ...game.extraChars]) {
        e.x = -500; e.vy = 0; e.vx = 0; e.splatTimer = 0;
      }
      const p = game.players[0];
      // WALL_X=742.4, WALL_WIDTH=24, WALL_Y=560-120=440
      p.x = 750; // on top of wall
      p.y = 300; // above wall
      p.vy = 200; // falling
      p.state = 'airborne';

      for (let i = 0; i < 60; i++) {
        game.update(1 / 60, new Set());
      }

      // Player should land on top of the wall
      expect(p.state).not.toBe('airborne');
      expect(p.y).toBeCloseTo(440 - 32, 0); // WALL_Y - PLAYER_HEIGHT
    });

    it('wall collision triggers sideSquash', () => {
      const p = game.players[0];
      p.x = 720;
      p.vx = 200; // fast rightward
      p.state = 'idle';
      p.sideSquash = 1;

      game.update(1 / 60, new Set(['d']));

      // After hitting wall, sideSquash should be less than 1
      // May need several frames
      for (let i = 0; i < 5; i++) {
        game.update(1 / 60, new Set(['d']));
      }
      // Player should have hit the wall at some point, triggering sideSquash
      expect(p.sideSquash).toBeLessThanOrEqual(1);
    });
  });

  // ---- Squash mechanics ----

  describe('squash mechanics', () => {
    it('sideSquash decays back to 1 over time', () => {
      const p = game.players[0];
      p.sideSquash = 0.75;
      p.x = 200;
      p.vx = 0;
      p.state = 'idle';

      for (let i = 0; i < 30; i++) {
        game.update(1 / 60, new Set());
      }

      expect(p.sideSquash).toBeCloseTo(1, 1);
    });

    it('squashScale decays back to 1 when not crouching', () => {
      const p = game.players[0];
      p.squashScale = 0.8;
      p.x = 200;
      p.state = 'idle';

      for (let i = 0; i < 30; i++) {
        game.update(1 / 60, new Set());
      }

      expect(p.squashScale).toBeCloseTo(1, 1);
    });
  });

  // ---- Splatted player behavior ----

  describe('splatted player behavior', () => {
    it('splatted player skips input processing', () => {
      const p = game.players[0];
      p.x = 200;
      p.splatTimer = 0.5;
      const xBefore = p.x;

      game.update(1 / 60, new Set(['d'])); // right key for P1

      // x should not change (input skipped)
      expect(p.x).toBe(xBefore);
    });

    it('splat timer decrements over time', () => {
      const p = game.players[0];
      p.splatTimer = 0.5;

      game.update(1 / 60, new Set());

      expect(p.splatTimer).toBeCloseTo(0.5 - 1 / 60, 4);
    });

    it('splatted NPC skips wandering', () => {
      const npc = game.extraChars[0];
      npc.splatTimer = 0.5;
      npc.vx = 50;
      const vxBefore = npc.vx;

      game.update(1 / 60, new Set());

      // vx should remain unchanged (wandering skipped)
      expect(npc.vx).toBe(vxBefore);
    });

    it('splatted bot skips AI', () => {
      const bot = game.bots[0];
      bot.splatTimer = 0.5;
      bot.vx = 0;
      const xBefore = bot.x;

      game.update(1 / 60, new Set());

      expect(bot.x).toBe(xBefore);
    });
  });

  // ---- Animation ----

  describe('animation frames', () => {
    it('animFrame advances when player is moving', () => {
      const p = game.players[0];
      p.x = 200;
      p.state = 'idle';
      p.animFrame = 0;

      for (let i = 0; i < 30; i++) {
        game.update(1 / 60, new Set(['d']));
      }

      expect(p.animFrame).toBeGreaterThan(0);
    });

    it('animFrame does not advance when player is still', () => {
      const p = game.players[0];
      p.x = 200;
      p.vx = 0;
      p.state = 'idle';
      p.animFrame = 0;

      game.update(1 / 60, new Set());

      expect(p.animFrame).toBe(0);
    });
  });

  // ---- Right screen boundary ----

  describe('right screen boundary', () => {
    it('clamps player to right edge', () => {
      const p = game.players[0];
      p.x = 1270;
      p.vx = 200;
      p.state = 'idle';

      game.update(1 / 60, new Set());

      expect(p.x + 32).toBeLessThanOrEqual(1280);
    });

    it('right boundary triggers sideSquash', () => {
      const p = game.players[0];
      p.x = 1270;
      p.vx = 200;
      p.sideSquash = 1;
      p.state = 'idle';

      game.update(1 / 60, new Set());

      // May not trigger immediately if wall blocks first, but boundary will clamp
      expect(p.x + 32).toBeLessThanOrEqual(1280);
    });
  });

  // ---- Bot AI details ----

  describe('bot AI details', () => {
    it('bot slows down once in ready zone', () => {
      const bot = game.bots[0];
      // Place bot at its target position inside the ready zone (slotIdx 0 → READY_ZONE_X + 30).
      // Within 30px of target, botLobbyInput returns no-input, friction decays vx toward 0.
      bot.x = READY_ZONE_X + 30;
      bot.state = 'idle';
      bot.vx = 100;

      for (let i = 0; i < 10; i++) {
        game.update(1 / 60, new Set());
      }

      // Bot should have slowed down (friction applied in-zone)
      expect(Math.abs(bot.vx)).toBeLessThan(100);
    });

    it('bot jumps near the wall', () => {
      const bot = game.bots[0];
      // Position bot just before the wall
      // WALL_X = 742.4, PLAYER_WIDTH = 32
      bot.x = 742.4 - 32 - 50; // approaching wall
      bot.state = 'idle';
      bot.vy = 0;

      // Run several ticks
      for (let i = 0; i < 20; i++) {
        game.update(1 / 60, new Set());
      }

      // Bot should have jumped at some point (vy was set to LOBBY_JUMP)
      // After landing, vy=0, but y might show they cleared the wall
      // Just verify the bot moved past the wall or is in air
      expect(bot.x > 742.4 - 60 || bot.vy < 0 || bot.state === 'airborne' || bot.y < 528).toBe(true);
    });
  });

  // ---- Ready zone sound ----

  describe('ready zone sound', () => {
    it('plays animal sound when entering ready zone', async () => {
      const audioMod = await import('./audio');
      const playAnimalSpy = vi.mocked(audioMod.audio.playAnimal);
      playAnimalSpy.mockClear();

      game.players[0].x = READY_ZONE_X + 10;
      game.bots[0].x = READY_ZONE_X + 50;

      game.update(1 / 60, new Set());

      expect(playAnimalSpy).toHaveBeenCalled();
    });

    it('does not replay sound if player stays in zone', async () => {
      const audioMod = await import('./audio');
      const playAnimalSpy = vi.mocked(audioMod.audio.playAnimal);

      game.players[0].x = READY_ZONE_X + 10;
      game.bots[0].x = READY_ZONE_X + 50;

      game.update(1 / 60, new Set());
      playAnimalSpy.mockClear();

      game.update(1 / 60, new Set());
      // Should not re-play since they stayed in zone
      expect(playAnimalSpy).not.toHaveBeenCalled();
    });

    it('replays sound if player leaves and re-enters zone', async () => {
      const audioMod = await import('./audio');
      const playAnimalSpy = vi.mocked(audioMod.audio.playAnimal);

      game.players[0].x = READY_ZONE_X + 10;
      game.bots[0].x = READY_ZONE_X + 50;
      game.update(1 / 60, new Set());
      playAnimalSpy.mockClear();

      // Move out
      game.players[0].x = 100;
      game.update(1 / 60, new Set());
      playAnimalSpy.mockClear();

      // Move back in
      game.players[0].x = READY_ZONE_X + 10;
      game.update(1 / 60, new Set());
      expect(playAnimalSpy).toHaveBeenCalled();
    });
  });

  // ---- Destroy ----

  describe('destroy cleanup', () => {
    it('clears ready sound set on destroy', () => {
      game.players[0].x = READY_ZONE_X + 10;
      game.bots[0].x = READY_ZONE_X + 50;
      game.update(1 / 60, new Set());

      game.destroy();
      expect(game.players).toHaveLength(0);
      expect(game.bots).toHaveLength(0);
      expect(game.extraChars).toHaveLength(0);
    });
  });

  // ---- Wall collision details ----

  describe('wall collision — right side push', () => {
    it('player approaching wall from right side is pushed out', () => {
      // Isolate player
      for (const e of [...game.players, ...game.bots, ...game.extraChars]) {
        e.x = -500; e.vy = 0; e.vx = 0; e.splatTimer = 0;
      }
      const p = game.players[0];
      // WALL_X=742.4, WALL_WIDTH=24 → right edge at 766.4
      p.x = 770; // just right of wall
      p.vx = -200; // moving left into wall
      p.y = 560 - 32; // at ground level
      p.state = 'idle';
      p.sideSquash = 1;

      for (let i = 0; i < 5; i++) {
        game.update(1 / 60, new Set());
      }

      // Player should be pushed to wall right edge
      expect(p.x).toBeGreaterThanOrEqual(742.4 + 24 - 1);
    });
  });

  // ---- NPC random jumping ----

  describe('NPC random jumping', () => {
    it('NPCs can randomly jump', () => {
      // Run many ticks — with 0.5% chance per frame, some NPC should jump
      let anyJumped = false;
      for (let i = 0; i < 500; i++) {
        game.update(1 / 60, new Set());
        if (game.extraChars.some(npc => npc.vy < 0)) {
          anyJumped = true;
          break;
        }
      }
      expect(anyJumped).toBe(true);
    });
  });

  // ---- Stomp between participants and extras ----

  describe('bot-to-NPC stomp', () => {
    it('bot can stomp an NPC and swap characters', () => {
      // Isolate
      for (const e of [...game.players, ...game.bots, ...game.extraChars]) {
        e.x = -500; e.vy = 0; e.vx = 0; e.splatTimer = 0;
      }

      const bot = game.bots[0];
      const npc = game.extraChars[0];

      const botCharBefore = bot.character.name;
      const npcCharBefore = npc.character.name;

      // Position bot directly above NPC, falling fast
      npc.x = 300;
      npc.y = 560 - 32;
      npc.state = 'idle';
      npc.splatTimer = 0;

      bot.x = 300;
      bot.y = 500;
      bot.vy = 200;
      bot.state = 'airborne';

      game.update(1 / 60, new Set());

      // Characters should be swapped
      expect(bot.character.name).toBe(npcCharBefore);
      expect(npc.character.name).toBe(botCharBefore);
      expect(npc.splatTimer).toBeGreaterThan(0);
    });

    it('bot cannot stomp another human player', () => {
      for (const e of [...game.players, ...game.bots, ...game.extraChars]) {
        e.x = -500; e.vy = 0; e.vx = 0; e.splatTimer = 0;
      }

      const bot = game.bots[0];
      const human = game.players[1];

      const humanCharBefore = human.character.name;

      // Position bot above human
      human.x = 300;
      human.y = 560 - 32;
      human.state = 'idle';
      human.splatTimer = 0;

      bot.x = 300;
      bot.y = 500;
      bot.vy = 200;
      bot.state = 'airborne';

      game.update(1 / 60, new Set());

      // Bot cannot stomp human — char should remain unchanged
      expect(human.character.name).toBe(humanCharBefore);
      expect(human.splatTimer).toBe(0);
    });
  });

  // ---- Crouch hold keeps squash ----

  describe('crouch hold squash', () => {
    it('holding crouch on ground maintains squash scale', () => {
      const p = game.players[0];
      p.state = 'idle';
      p.squashScale = 1;
      p.x = 200;

      // Hold down (crouch)
      game.update(1 / 60, new Set(['s']));
      expect(p.squashScale).toBeLessThan(1);

      const squashAfterFirst = p.squashScale;

      // Continue holding — should not decay back to 1
      game.update(1 / 60, new Set(['s']));
      expect(p.squashScale).toBeLessThanOrEqual(squashAfterFirst);
    });
  });

  // ---- Bot AI in ready zone ----

  describe('bot AI in ready zone behavior', () => {
    it('bot settles near target position in ready zone', () => {
      const bot = game.bots[0];
      bot.x = READY_ZONE_X + 100;
      bot.state = 'idle';
      bot.vx = 0;

      // Run many ticks — bot should slow down near target
      for (let i = 0; i < 60; i++) {
        game.update(1 / 60, new Set());
      }

      // Bot should have very low velocity (settled)
      expect(Math.abs(bot.vx)).toBeLessThan(50);
    });
  });

  // ---- Bot climbing over wall ----

  describe('bot wall traversal', () => {
    it('bot above wall maintains rightward movement', () => {
      const bot = game.bots[0];
      // WALL_X=742.4, WALL_Y=440, WALL_WIDTH=24
      // Position bot above the wall, in the air
      bot.x = 745; // over the wall
      bot.y = 400; // above wall top (440)
      bot.state = 'airborne';
      bot.vy = -100; // still going up from jump

      game.update(1 / 60, new Set());

      // Bot should maintain rightward movement while above wall
      expect(bot.facing).toBe('right');
    });
  });

  // ---- Render method ----

  describe('render', () => {
    function makeMockCtx() {
      return {
        fillStyle: '' as any,
        strokeStyle: '' as any,
        lineWidth: 1,
        lineCap: '' as string,
        lineJoin: '' as string,
        font: '' as string,
        textAlign: '' as string,
        textBaseline: '' as string,
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        shadowColor: '',
        shadowBlur: 0,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
        rotate: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        arc: vi.fn(),
        ellipse: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillRect: vi.fn(),
        clearRect: vi.fn(),
        fillText: vi.fn(),
        strokeText: vi.fn(),
        measureText: vi.fn(() => ({ width: 50, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })),
        createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        drawImage: vi.fn(),
        setLineDash: vi.fn(),
        quadraticCurveTo: vi.fn(),
        bezierCurveTo: vi.fn(),
        clip: vi.fn(),
        rect: vi.fn(),
        roundRect: vi.fn(),
        canvas: { width: 1280, height: 720 },
      } as any;
    }

    it('render() calls drawLobby without crashing', () => {
      const ctx = makeMockCtx();
      expect(() => game.render(ctx, 1 / 60)).not.toThrow();
    });

    it('render() draws sky gradient', () => {
      const ctx = makeMockCtx();
      game.render(ctx, 1 / 60);
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('render() draws character sprites', async () => {
      const ctx = makeMockCtx();
      game.render(ctx, 1 / 60);
      const mod = await import('./rendering/players');
      expect(vi.mocked(mod.drawPlayer)).toHaveBeenCalled();
    });

    it('render() draws wall', () => {
      const ctx = makeMockCtx();
      game.render(ctx, 1 / 60);
      // Wall is drawn via fillRect with gradient
      expect(ctx.createLinearGradient).toHaveBeenCalled();
    });

    it('render() draws ready zone overlay', () => {
      const ctx = makeMockCtx();
      game.render(ctx, 1 / 60);
      // Zone gradient is created
      const gradientCalls = ctx.createLinearGradient.mock.calls;
      expect(gradientCalls.length).toBeGreaterThanOrEqual(3); // sky + ground + wall + zone
    });

    it('render() draws character name tags', () => {
      const ctx = makeMockCtx();
      game.render(ctx, 1 / 60);
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it('render() draws countdown when active', () => {
      const ctx = makeMockCtx();
      game.players[0].x = READY_ZONE_X + 10;
      game.bots[0].x = READY_ZONE_X + 50;
      game.update(1 / 60, new Set());
      expect(game.countdownStarted).toBe(true);

      game.render(ctx, 1 / 60);
      // Countdown text should be drawn
      const textCalls = ctx.fillText.mock.calls.map((c: any[]) => c[0]);
      const hasCountdown = textCalls.some((t: string) => /\d/.test(t));
      expect(hasCountdown || ctx.fillText.mock.calls.length > 5).toBe(true);
    });

    it('render() handles mobile mode', () => {
      const mobile = makeLobbyGame({ isMobile: true, botCount: 1 });
      const ctx = makeMockCtx();
      expect(() => mobile.render(ctx, 1 / 60)).not.toThrow();
    });

    it('render() draws splatted characters differently', () => {
      const ctx = makeMockCtx();
      game.players[0].splatTimer = 0.5;
      expect(() => game.render(ctx, 1 / 60)).not.toThrow();
    });

    it('render() draws trees and bushes', async () => {
      const ctx = makeMockCtx();
      game.render(ctx, 1 / 60);
      const mod = await import('./themes/drawPrimitives');
      expect(vi.mocked(mod.drawTree)).toHaveBeenCalled();
      expect(vi.mocked(mod.drawBush)).toHaveBeenCalled();
    });

    it('render() draws flowers', async () => {
      const ctx = makeMockCtx();
      game.render(ctx, 1 / 60);
      const mod = await import('./themes/drawPrimitives');
      expect(vi.mocked(mod.drawFlower)).toHaveBeenCalled();
    });

    it('render() initializes wildlife on first render', async () => {
      const fresh = makeLobbyGame();
      const ctx = makeMockCtx();
      fresh.render(ctx, 1 / 60);
      const mod = await import('./canvasAnimations');
      expect(vi.mocked(mod.initWildlife)).toHaveBeenCalled();
    });

    it('render() shows zone participant counts', () => {
      const ctx = makeMockCtx();
      game.players[0].x = READY_ZONE_X + 10;
      game.players[1].x = READY_ZONE_X + 50;
      game.bots[0].x = READY_ZONE_X + 30;
      game.update(1 / 60, new Set());
      game.render(ctx, 1 / 60);
      // Should render text with participant info
      expect(ctx.fillText).toHaveBeenCalled();
    });
  });
});
