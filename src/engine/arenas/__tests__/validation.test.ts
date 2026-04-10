import { describe, it, expect, beforeAll } from 'vitest';
import { registerBuiltinArenas } from '../builtin';
import { getArenaPack, listArenaPacks } from '../registry';
import type { ArenaPack } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';

// Register all 11 built-in arenas once before the suite runs.
beforeAll(() => {
  registerBuiltinArenas();
});

// Collect all built-in arena IDs so every describe.each iterates all of them.
function getAllPacks(): Array<{ id: string; pack: ArenaPack }> {
  return listArenaPacks().map(entry => {
    const pack = getArenaPack(entry.id);
    if (!pack) throw new Error(`Pack '${entry.id}' listed but not retrievable`);
    return { id: entry.id, pack };
  });
}

// ---------------------------------------------------------------------------
// Expected built-in arena IDs (sanity check)
// ---------------------------------------------------------------------------
const EXPECTED_ARENA_IDS = [
  'meadow', 'winter_lake', 'volcano', 'castle', 'candy_land',
  'treetops', 'underwater', 'haunted_graveyard', 'rooftops', 'space_station', 'waterfall',
];

describe('Arena validation - all 11 built-in arenas', () => {

  it('all 11 expected arenas are registered', () => {
    const list = listArenaPacks();
    const ids = list.map(e => e.id);
    for (const expectedId of EXPECTED_ARENA_IDS) {
      expect(ids, `Missing arena: ${expectedId}`).toContain(expectedId);
    }
    // At least 11 (may have more from other test suites that register mocks)
    expect(list.length).toBeGreaterThanOrEqual(11);
  });

  // ---------------------------------------------------------------------------
  // 1. Platform validity
  // ---------------------------------------------------------------------------
  describe('platform validity', () => {
    it.each(EXPECTED_ARENA_IDS)('%s - has at least 1 platform', (id) => {
      const pack = getArenaPack(id)!;
      expect(pack.platforms.length).toBeGreaterThanOrEqual(1);
    });

    it.each(EXPECTED_ARENA_IDS)('%s - ground platform rule (platforms[0] y >= 650 unless allowFallOff)', (id) => {
      const pack = getArenaPack(id)!;
      // allowFallOff arenas have no traditional ground platform -- they have gaps
      // where players fall off. The ground platform rule only applies to solid-ground arenas.
      if (pack.allowFallOff) {
        // For fall-off arenas, just verify platforms[0] exists (already checked above)
        expect(pack.platforms[0]).toBeDefined();
      } else {
        expect(pack.platforms[0].y).toBeGreaterThanOrEqual(650);
      }
    });

    it.each(EXPECTED_ARENA_IDS)('%s - all platform coordinates within canvas bounds', (id) => {
      const pack = getArenaPack(id)!;
      for (let i = 0; i < pack.platforms.length; i++) {
        const p = pack.platforms[i];
        expect(p.x, `platform[${i}].x out of bounds`).toBeGreaterThanOrEqual(0);
        expect(p.x, `platform[${i}].x exceeds canvas width`).toBeLessThanOrEqual(CANVAS_WIDTH);
        expect(p.y, `platform[${i}].y out of bounds`).toBeGreaterThanOrEqual(0);
        expect(p.y, `platform[${i}].y exceeds canvas height`).toBeLessThanOrEqual(CANVAS_HEIGHT);
      }
    });

    it.each(EXPECTED_ARENA_IDS)('%s - all platform widths and heights are positive', (id) => {
      const pack = getArenaPack(id)!;
      for (let i = 0; i < pack.platforms.length; i++) {
        const p = pack.platforms[i];
        expect(p.width, `platform[${i}].width must be positive`).toBeGreaterThan(0);
        expect(p.height, `platform[${i}].height must be positive`).toBeGreaterThan(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Spawn point validity
  // ---------------------------------------------------------------------------
  describe('spawn point validity', () => {
    it.each(EXPECTED_ARENA_IDS)('%s - has at least 2 spawn points', (id) => {
      const pack = getArenaPack(id)!;
      expect(pack.spawnPoints.length).toBeGreaterThanOrEqual(2);
    });

    it.each(EXPECTED_ARENA_IDS)('%s - spawn points within canvas bounds', (id) => {
      const pack = getArenaPack(id)!;
      for (let i = 0; i < pack.spawnPoints.length; i++) {
        const sp = pack.spawnPoints[i];
        expect(sp.x, `spawnPoint[${i}].x out of bounds`).toBeGreaterThanOrEqual(0);
        expect(sp.x, `spawnPoint[${i}].x exceeds width`).toBeLessThanOrEqual(CANVAS_WIDTH);
        expect(sp.y, `spawnPoint[${i}].y out of bounds`).toBeGreaterThanOrEqual(0);
        expect(sp.y, `spawnPoint[${i}].y exceeds height`).toBeLessThanOrEqual(CANVAS_HEIGHT);
      }
    });

    it.each(EXPECTED_ARENA_IDS)('%s - spawn points do not overlap hazard zones', (id) => {
      const pack = getArenaPack(id)!;
      if (!pack.hazardZones || pack.hazardZones.length === 0) return;

      for (let si = 0; si < pack.spawnPoints.length; si++) {
        const sp = pack.spawnPoints[si];
        for (let hi = 0; hi < pack.hazardZones.length; hi++) {
          const hz = pack.hazardZones[hi];
          const inside =
            sp.x >= hz.x &&
            sp.x <= hz.x + hz.width &&
            sp.y >= hz.y &&
            sp.y <= hz.y + hz.height;
          expect(inside, `spawnPoint[${si}] overlaps hazardZone[${hi}]`).toBe(false);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Music file
  // ---------------------------------------------------------------------------
  describe('music file', () => {
    it.each(EXPECTED_ARENA_IDS)('%s - has a non-empty musicFile string', (id) => {
      const pack = getArenaPack(id)!;
      expect(pack.musicFile).toBeDefined();
      expect(typeof pack.musicFile).toBe('string');
      expect(pack.musicFile!.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Translations
  // ---------------------------------------------------------------------------
  describe('translations', () => {
    it.each(EXPECTED_ARENA_IDS)('%s - has English (en) translation', (id) => {
      const pack = getArenaPack(id)!;
      expect(pack.translations.en).toBeDefined();
      expect(typeof pack.translations.en).toBe('string');
      expect(pack.translations.en.length).toBeGreaterThan(0);
    });

    it.each(EXPECTED_ARENA_IDS)('%s - has Czech (cs) translation', (id) => {
      const pack = getArenaPack(id)!;
      expect(pack.translations.cs).toBeDefined();
      expect(typeof pack.translations.cs).toBe('string');
      expect(pack.translations.cs.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Preview data
  // ---------------------------------------------------------------------------
  describe('preview data', () => {
    it.each(EXPECTED_ARENA_IDS)('%s - has previewGradient', (id) => {
      const pack = getArenaPack(id)!;
      expect(pack.previewGradient).toBeDefined();
      expect(typeof pack.previewGradient).toBe('string');
      expect(pack.previewGradient.length).toBeGreaterThan(0);
    });

    it.each(EXPECTED_ARENA_IDS)('%s - has previewIcon', (id) => {
      const pack = getArenaPack(id)!;
      expect(pack.previewIcon).toBeDefined();
      expect(typeof pack.previewIcon).toBe('string');
      expect(pack.previewIcon.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Effect zone validity (if present)
  // ---------------------------------------------------------------------------
  describe('effect zone validity', () => {
    const VALID_EFFECT_TYPES = ['zero_g', 'current', 'geyser'] as const;

    it.each(EXPECTED_ARENA_IDS)('%s - effect zones have valid types', (id) => {
      const pack = getArenaPack(id)!;
      if (!pack.effectZones || pack.effectZones.length === 0) return;

      for (let i = 0; i < pack.effectZones.length; i++) {
        const ez = pack.effectZones[i];
        expect(
          (VALID_EFFECT_TYPES as readonly string[]).includes(ez.type),
          `effectZone[${i}] has invalid type '${ez.type}'`,
        ).toBe(true);
      }
    });

    it.each(EXPECTED_ARENA_IDS)('%s - geyser zones have interval and duration > 0', (id) => {
      const pack = getArenaPack(id)!;
      if (!pack.effectZones) return;

      const geysers = pack.effectZones.filter(ez => ez.type === 'geyser');
      for (let i = 0; i < geysers.length; i++) {
        const g = geysers[i];
        expect(g.interval, `geyser[${i}] interval must be > 0`).toBeGreaterThan(0);
        expect(g.duration, `geyser[${i}] duration must be > 0`).toBeGreaterThan(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Nav data
  // ---------------------------------------------------------------------------
  describe('nav data', () => {
    it.each(EXPECTED_ARENA_IDS)('%s - has navData for AI bots', (id) => {
      const pack = getArenaPack(id)!;
      expect(pack.navData, `arena '${id}' is missing navData`).toBeDefined();
      expect(pack.navData!.edges).toBeDefined();
      expect(pack.navData!.nextHop).toBeDefined();
      expect(pack.navData!.safeHop).toBeDefined();
    });

    it.each(EXPECTED_ARENA_IDS)('%s - navData edge count matches platform count', (id) => {
      const pack = getArenaPack(id)!;
      if (!pack.navData) return;
      expect(pack.navData.edges.length).toBe(pack.platforms.length);
      expect(pack.navData.nextHop.length).toBe(pack.platforms.length);
      expect(pack.navData.safeHop.length).toBe(pack.platforms.length);
    });
  });
});
