import type { Arena } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

// ============================================================
// MEADOW — Classic balanced layout (the baseline)
// ============================================================
export const MEADOW_ARENA: Arena = {
  id: 'meadow',
  name: 'Meadow',
  themeId: 'meadow',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    { x: 0, y: 660, width: CANVAS_WIDTH, height: 60 },         // Ground
    { x: 100, y: 530, width: 180, height: 24 },                 // Low left
    { x: 1000, y: 530, width: 180, height: 24 },                // Low right
    { x: 300, y: 410, width: 220, height: 24 },                 // Mid left
    { x: 760, y: 410, width: 220, height: 24 },                 // Mid right
    { x: 540, y: 480, width: 200, height: 24 },                 // Mid center
    { x: 490, y: 290, width: 300, height: 24 },                 // Top center
    { x: 120, y: 340, width: 140, height: 24 },                 // High left
    { x: 1020, y: 340, width: 140, height: 24 },                // High right
    { x: 340, y: 615, width: 55, height: 45 },                  // Stump left ground
    { x: 860, y: 615, width: 55, height: 45 },                  // Stump right ground
    { x: 440, y: 370, width: 45, height: 40 },                  // Stump on mid-left plat
    { x: 800, y: 370, width: 45, height: 40 },                  // Stump on mid-right plat
  ],
  spawnPoints: [
    { x: 190, y: 510 }, { x: 1090, y: 510 },
    { x: 410, y: 390 }, { x: 870, y: 390 },
    { x: 640, y: 270 }, { x: 640, y: 640 },
  ],
};

// ============================================================
// WINTER LAKE — Ice staircases + bridge + slippery perches
// ============================================================
export const WINTER_LAKE_ARENA: Arena = {
  id: 'winter_lake',
  name: 'Winter Lake',
  themeId: 'winter_lake',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    // Ground — flat full width
    { x: 0, y: 660, width: CANVAS_WIDTH, height: 60 },
    // Left ice staircase — 3 steps climbing up
    { x: 40, y: 580, width: 130, height: 24 },                  // Step 1
    { x: 100, y: 500, width: 120, height: 24 },                 // Step 2
    { x: 40, y: 420, width: 130, height: 24 },                  // Step 3
    // Right ice staircase — 3 steps climbing up
    { x: 1110, y: 580, width: 130, height: 24 },                // Step 1
    { x: 1060, y: 500, width: 120, height: 24 },                // Step 2
    { x: 1110, y: 420, width: 130, height: 24 },                // Step 3
    // High center bridge (icicle spikes hang from this)
    { x: 440, y: 360, width: 400, height: 24 },                 // Frozen bridge
    // Left perch at top of staircase (no right perch — igloo is decorative)
    { x: 50, y: 340, width: 110, height: 24 },                  // Left perch
    // Center platform
    { x: 520, y: 500, width: 240, height: 24 },                 // Mid island
    // Ice cube blocks on ground (solid, aligned with visual)
    { x: 370, y: 610, width: 65, height: 50 },                  // Ice block L
    { x: 870, y: 610, width: 65, height: 50 },                  // Ice block R
    // Stepping stones between staircase and center
    { x: 270, y: 440, width: 90, height: 24 },                  // Connect L
    { x: 920, y: 440, width: 90, height: 24 },                  // Connect R
    // Small slippery platforms — hard to land on with low friction
    { x: 380, y: 280, width: 45, height: 18 },                  // Tiny above bridge L
    { x: 855, y: 280, width: 45, height: 18 },                  // Tiny above bridge R
    { x: 600, y: 230, width: 50, height: 18 },                  // Tiny top center
    { x: 200, y: 350, width: 40, height: 18 },                  // Tiny left mid
    { x: 1040, y: 350, width: 40, height: 18 },                 // Tiny right mid
  ],
  spawnPoints: [
    { x: 100, y: 560 }, { x: 1170, y: 560 },
    { x: 100, y: 400 }, { x: 1170, y: 400 },
    { x: 640, y: 340 }, { x: 640, y: 640 },
  ],
  hazardZones: [
    // Icicle spikes under the frozen bridge
    { x: 455, y: 384, width: 80, height: 14, type: 'lava' },
    { x: 580, y: 384, width: 80, height: 14, type: 'lava' },
    { x: 705, y: 384, width: 80, height: 14, type: 'lava' },
    // Icicles under mid island
    { x: 570, y: 524, width: 70, height: 10, type: 'lava' },
  ],
};

// ============================================================
// VOLCANO — Lava pit gaps + vertical obsidian pillars + asymmetric
// ============================================================
export const VOLCANO_ARENA: Arena = {
  id: 'volcano',
  name: 'Volcano',
  themeId: 'volcano',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    // Ground — 3 rock islands separated by lava pits
    { x: 0, y: 660, width: 260, height: 60 },                  // Left island
    { x: 420, y: 660, width: 400, height: 60 },                 // Center island
    { x: 980, y: 660, width: 300, height: 60 },                 // Right island
    // Lava pit floors (lower — players can jump out even when hurt)
    { x: 260, y: 700, width: 160, height: 20 },                 // Left pit floor
    { x: 820, y: 700, width: 160, height: 20 },                 // Right pit floor
    // Obsidian pillars — solid blocks on ground
    { x: 200, y: 600, width: 40, height: 60 },                  // Pillar left
    { x: 600, y: 605, width: 35, height: 55 },                  // Pillar center
    { x: 900, y: 595, width: 40, height: 65 },                  // Pillar right
    // === Many short stepping platforms — easy to reach from ground ===
    // Low tier (just above ground — easy first jumps)
    { x: 60, y: 580, width: 80, height: 24 },                   // Low left
    { x: 320, y: 570, width: 70, height: 24 },                  // Low center-left
    { x: 540, y: 575, width: 80, height: 24 },                  // Low center
    { x: 750, y: 570, width: 70, height: 24 },                  // Low center-right
    { x: 1050, y: 580, width: 80, height: 24 },                 // Low right
    // Mid tier
    { x: 30, y: 480, width: 90, height: 24 },                   // Mid far left
    { x: 200, y: 470, width: 80, height: 24 },                  // Mid left
    { x: 440, y: 480, width: 90, height: 24 },                  // Mid center-left
    { x: 700, y: 475, width: 80, height: 24 },                  // Mid center-right
    { x: 1000, y: 485, width: 90, height: 24 },                 // Mid right
    { x: 1160, y: 470, width: 80, height: 24 },                 // Mid far right
    // Upper tier
    { x: 100, y: 370, width: 90, height: 24 },                  // Upper left
    { x: 350, y: 380, width: 80, height: 24 },                  // Upper center-left
    { x: 830, y: 375, width: 80, height: 24 },                  // Upper center-right
    { x: 1060, y: 370, width: 90, height: 24 },                 // Upper right
    // High center
    { x: 530, y: 300, width: 220, height: 24 },                 // Top center
    // Stepping stones to top
    { x: 530, y: 390, width: 80, height: 24 },                  // Step to top L
    { x: 680, y: 385, width: 80, height: 24 },                  // Step to top R
  ],
  spawnPoints: [
    { x: 130, y: 560 }, { x: 1110, y: 560 },
    { x: 320, y: 460 }, { x: 1060, y: 460 },
    { x: 640, y: 280 }, { x: 640, y: 640 },
  ],
  hazardZones: [
    // Lava on pit floors — hurts but players can jump out
    { x: 275, y: 694, width: 130, height: 6, type: 'lava' },
    { x: 835, y: 694, width: 130, height: 6, type: 'lava' },
    // Small surface lava on center island
    { x: 580, y: 654, width: 60, height: 6, type: 'lava' },
  ],
};

// ============================================================
// CASTLE — Twin towers with staircase + bridge + spike pits
// ============================================================
export const CASTLE_ARENA: Arena = {
  id: 'castle',
  name: 'Castle',
  themeId: 'castle',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    // Ground — 3 segments with 2 spike pits between them
    { x: 0, y: 660, width: 240, height: 60 },                  // Left floor
    { x: 380, y: 660, width: 520, height: 60 },                 // Center floor
    { x: 1040, y: 660, width: 240, height: 60 },                // Right floor
    // Spike pit floors (lower — players can jump out)
    { x: 240, y: 700, width: 140, height: 20 },                 // Left pit floor
    { x: 900, y: 700, width: 140, height: 20 },                 // Right pit floor
    // Left tower staircase (zigzag up the left wall)
    { x: 30, y: 580, width: 130, height: 24 },                  // L stair 1
    { x: 130, y: 500, width: 120, height: 24 },                 // L stair 2
    { x: 30, y: 420, width: 130, height: 24 },                  // L stair 3
    { x: 130, y: 340, width: 120, height: 24 },                 // L stair 4
    // Right tower staircase (zigzag up the right wall)
    { x: 1120, y: 580, width: 130, height: 24 },                // R stair 1
    { x: 1030, y: 500, width: 120, height: 24 },                // R stair 2
    { x: 1120, y: 420, width: 130, height: 24 },                // R stair 3
    { x: 1030, y: 340, width: 120, height: 24 },                // R stair 4
    // Grand bridge connecting towers at top
    { x: 250, y: 280, width: 780, height: 24 },                 // Top bridge
    // Center structure — mid-level platforms
    { x: 480, y: 480, width: 180, height: 24 },                 // Center low
    { x: 520, y: 380, width: 240, height: 24 },                 // Center mid
    // Jumpable stone pillars on ground floor (solid blocks)
    { x: 430, y: 590, width: 40, height: 70 },                  // Pillar L
    { x: 630, y: 600, width: 40, height: 60 },                  // Pillar center
    { x: 820, y: 590, width: 40, height: 70 },                  // Pillar R
    // Small mid connecting platforms
    { x: 280, y: 440, width: 100, height: 24 },                 // L-to-center
    { x: 900, y: 440, width: 100, height: 24 },                 // R-to-center
  ],
  spawnPoints: [
    { x: 100, y: 560 }, { x: 1180, y: 560 },
    { x: 90, y: 400 }, { x: 1180, y: 400 },
    { x: 640, y: 260 }, { x: 640, y: 640 },
  ],
  hazardZones: [
    // Spike pit left — sits on pit floor, player lands on floor and gets hurt
    { x: 255, y: 694, width: 110, height: 6, type: 'lava' },
    // Spike pit right
    { x: 915, y: 694, width: 110, height: 6, type: 'lava' },
  ],
};

// ============================================================
// CANDY LAND — Vertical bounce tower + curved side arcs
// ============================================================
export const CANDY_LAND_ARENA: Arena = {
  id: 'candy_land',
  name: 'Candy Land',
  themeId: 'candy_land',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    // Ground — full width (BOUNCY!)
    { x: 0, y: 660, width: CANVAS_WIDTH, height: 60 },
    // === Candy Tower (center) — stacking up with big gaps ===
    { x: 460, y: 530, width: 360, height: 24 },                 // Tower base
    { x: 510, y: 390, width: 260, height: 24 },                 // Tower mid (big 140px gap!)
    { x: 560, y: 260, width: 160, height: 24 },                 // Tower crown (130px gap!)
    // === Side launch pads — few, spread out ===
    { x: 40, y: 520, width: 160, height: 24 },                  // Left low
    { x: 1080, y: 520, width: 160, height: 24 },                // Right low
    // High side perches (reachable only by bouncing)
    { x: 60, y: 340, width: 130, height: 24 },                  // Left high
    { x: 1090, y: 340, width: 130, height: 24 },                // Right high
  ],
  spawnPoints: [
    { x: 140, y: 500 }, { x: 1160, y: 500 },
    { x: 640, y: 510 }, { x: 640, y: 240 },
    { x: 130, y: 320 }, { x: 1155, y: 320 },
  ],
  bouncyPlatforms: [0, 1, 2, 3, 4, 5, 6, 7],  // EVERYTHING is bouncy!
};

// ============================================================
// TREETOPS — NO ground! Pure vertical canopy platforming
// ============================================================
export const TREETOPS_ARENA: Arena = {
  id: 'treetops',
  name: 'Treetops',
  themeId: 'treetops',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    // platforms[0] = lowest playable branch (theme uses this for decoration Y reference)
    // === Layer 1 — Lowest playable branches (y~580-600) ===
    { x: 30, y: 600, width: 180, height: 24 },                  // Branch far left
    { x: 400, y: 590, width: 240, height: 24 },                 // Branch center-left
    { x: 800, y: 600, width: 220, height: 24 },                 // Branch center-right
    { x: 1100, y: 585, width: 160, height: 24 },                // Branch far right
    // === Layer 2 — Mid branches (y~470-490) ===
    { x: 120, y: 490, width: 200, height: 24 },                 // Mid left
    { x: 460, y: 480, width: 180, height: 24 },                 // Mid center-left
    { x: 700, y: 485, width: 160, height: 24 },                 // Mid center-right
    { x: 1000, y: 475, width: 200, height: 24 },                // Mid right
    // === Vine bridges — narrow connectors (50px wide) ===
    { x: 310, y: 540, width: 50, height: 20 },                  // Vine bridge L1-L2
    { x: 680, y: 545, width: 50, height: 20 },                  // Vine bridge L1-L2
    { x: 950, y: 535, width: 50, height: 20 },                  // Vine bridge R1-R2
    // === Layer 3 — Upper branches (y~370) ===
    { x: 50, y: 380, width: 160, height: 24 },                  // Upper left
    { x: 500, y: 370, width: 280, height: 24 },                 // Upper center (wide)
    { x: 1050, y: 375, width: 160, height: 24 },                // Upper right
    // === Layer 4 — Crown (y~260) ===
    { x: 440, y: 260, width: 300, height: 24 },                 // Crown — eagle nest
    // Stepping branches between layers
    { x: 300, y: 430, width: 70, height: 20 },                  // Step L2-L3
    { x: 880, y: 425, width: 70, height: 20 },                  // Step R2-L3
    { x: 280, y: 320, width: 70, height: 20 },                  // Step L3-L4
    { x: 850, y: 315, width: 70, height: 20 },                  // Step R3-L4
  ],
  spawnPoints: [
    { x: 120, y: 580 }, { x: 1180, y: 565 },
    { x: 500, y: 570 }, { x: 900, y: 580 },
    { x: 640, y: 240 }, { x: 220, y: 470 },
  ],
  allowFallOff: true,
};

// ============================================================
// UNDERWATER — Wide bubble column elevator + scattered side perches
// ============================================================
export const UNDERWATER_ARENA: Arena = {
  id: 'underwater',
  name: 'Underwater',
  themeId: 'underwater',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    // Ground — ocean floor
    { x: 0, y: 660, width: CANVAS_WIDTH, height: 60 },
    // === Left side platforms (unreachable by jumping, need bubble column) ===
    { x: 80, y: 400, width: 120, height: 24 },                  // Left low
    { x: 180, y: 270, width: 110, height: 24 },                 // Left mid
    { x: 60, y: 150, width: 120, height: 24 },                  // Left high
    // === Right side platforms ===
    { x: 1080, y: 400, width: 120, height: 24 },                // Right low
    { x: 990, y: 270, width: 110, height: 24 },                 // Right mid
    { x: 1100, y: 150, width: 120, height: 24 },                // Right high
    // === Near-column perches (exit points from bubble stream) ===
    { x: 310, y: 340, width: 90, height: 24 },                  // Left exit mid
    { x: 880, y: 340, width: 90, height: 24 },                  // Right exit mid
    { x: 290, y: 170, width: 100, height: 24 },                 // Left exit high
    { x: 890, y: 170, width: 100, height: 24 },                 // Right exit high
    // Top platform above bubble column
    { x: 540, y: 80, width: 200, height: 24 },                  // Top crown
  ],
  spawnPoints: [
    { x: 200, y: 640 }, { x: 1080, y: 640 },
    { x: 400, y: 640 }, { x: 880, y: 640 },
    { x: 640, y: 640 }, { x: 640, y: 60 },
  ],
  effectZones: [
    // WIDE central bubble column — full height, 400px wide elevator
    { x: 440, y: 0, width: 400, height: 660, type: 'geyser', strength: -500, interval: 0.1, duration: 9999 },
    // Gentle currents pushing toward center (funnel players to the column)
    { x: 200, y: 400, width: 200, height: 260, type: 'current', vx: 70 },
    { x: 880, y: 400, width: 200, height: 260, type: 'current', vx: -70 },
  ],
};

// ============================================================
// HAUNTED GRAVEYARD — Headstone blocks + mausoleum + zombie pits
// ============================================================
export const HAUNTED_GRAVEYARD_ARENA: Arena = {
  id: 'haunted_graveyard',
  name: 'Haunted Graveyard',
  themeId: 'haunted_graveyard',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    // Ground — full width
    { x: 0, y: 660, width: CANVAS_WIDTH, height: 60 },
    // === Headstone blocks on ground (small solid obstacles) ===
    { x: 120, y: 625, width: 35, height: 35 },                  // Headstone 1
    { x: 280, y: 625, width: 35, height: 35 },                  // Headstone 2
    { x: 500, y: 625, width: 35, height: 35 },                  // Headstone 3
    { x: 680, y: 625, width: 35, height: 35 },                  // Headstone 4
    { x: 900, y: 625, width: 35, height: 35 },                  // Headstone 5
    { x: 1080, y: 625, width: 35, height: 35 },                 // Headstone 6
    // === Mausoleum (solid block — roof is standable, walls block passage) ===
    { x: 480, y: 420, width: 320, height: 240 },                // Mausoleum
    // === Crypt platforms (sides) ===
    { x: 30, y: 530, width: 170, height: 24 },                  // Left crypt low
    { x: 20, y: 390, width: 150, height: 24 },                  // Left crypt high
    { x: 1080, y: 530, width: 170, height: 24 },                // Right crypt low
    { x: 1110, y: 390, width: 150, height: 24 },                // Right crypt high
    // === Upper floating platforms ===
    { x: 250, y: 340, width: 140, height: 24 },                 // Upper left
    { x: 890, y: 340, width: 140, height: 24 },                 // Upper right
    { x: 520, y: 290, width: 240, height: 24 },                 // Top center (above mausoleum)
    // Small connectors
    { x: 200, y: 450, width: 100, height: 24 },                 // Connect L to mausoleum
    { x: 980, y: 450, width: 100, height: 24 },                 // Connect R to mausoleum
  ],
  spawnPoints: [
    { x: 100, y: 510 }, { x: 1160, y: 510 },
    { x: 640, y: 400 }, { x: 640, y: 640 },
    { x: 320, y: 320 }, { x: 960, y: 320 },
  ],
};

// ============================================================
// ROOFTOPS — Different building heights + fire escape + chimney cluster
// ============================================================
export const ROOFTOPS_ARENA: Arena = {
  id: 'rooftops',
  name: 'Rooftops',
  themeId: 'rooftops',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    // === Building A (left, x=0-320) ===
    { x: 0, y: 660, width: 320, height: 60 },                  // A rooftop
    { x: 10, y: 560, width: 300, height: 18 },                  // A hallway (one only)
    // Rooftop furniture: chimney + AC block
    { x: 60, y: 620, width: 30, height: 40 },                   // A chimney
    { x: 220, y: 630, width: 45, height: 30 },                  // A rooftop AC
    // === Building B (center, x=470-810) ===
    { x: 470, y: 640, width: 340, height: 80 },                 // B rooftop (taller)
    { x: 480, y: 540, width: 320, height: 18 },                 // B hallway (one only)
    // Rooftop furniture
    { x: 530, y: 600, width: 30, height: 40 },                  // B chimney L
    { x: 760, y: 605, width: 30, height: 35 },                  // B chimney R
    { x: 640, y: 610, width: 50, height: 30 },                  // B rooftop AC
    // === Building C (right, x=960-1280) ===
    { x: 960, y: 650, width: 320, height: 70 },                 // C rooftop
    { x: 970, y: 555, width: 300, height: 18 },                 // C hallway (one only)
    // Rooftop furniture
    { x: 1100, y: 610, width: 30, height: 40 },                 // C chimney
    { x: 1020, y: 620, width: 45, height: 30 },                 // C rooftop AC
    // === Wall ACs/balconies — stepping stones across gaps ===
    // Gap 1 (320-470): A right face + B left face
    { x: 295, y: 610, width: 50, height: 16 },                  // AC: A right low
    { x: 435, y: 600, width: 50, height: 16 },                  // AC: B left low
    { x: 355, y: 530, width: 55, height: 14 },                  // Balcony: mid-gap high
    // Gap 2 (810-960): B right face + C left face
    { x: 800, y: 610, width: 50, height: 16 },                  // AC: B right low
    { x: 925, y: 600, width: 50, height: 16 },                  // AC: C left low
    { x: 860, y: 530, width: 55, height: 14 },                  // Balcony: mid-gap high
    // === Upper platforms above rooftops ===
    { x: 100, y: 470, width: 140, height: 20 },                 // Above A
    { x: 560, y: 440, width: 160, height: 20 },                 // Above B
    { x: 1060, y: 460, width: 140, height: 20 },                // Above C
    // Top walkway connecting upper platforms
    { x: 350, y: 370, width: 300, height: 20 },                 // High bridge L
    { x: 780, y: 380, width: 200, height: 20 },                 // High bridge R
  ],
  spawnPoints: [
    { x: 160, y: 640 }, { x: 640, y: 620 }, { x: 1120, y: 630 },
    { x: 160, y: 540 }, { x: 640, y: 520 }, { x: 1120, y: 535 },
  ],
  allowFallOff: true,
};

// ============================================================
// SPACE STATION — Central zero-G void + edge platforms only
// ============================================================
export const SPACE_STATION_ARENA: Arena = {
  id: 'space_station',
  name: 'Space Station',
  themeId: 'space_station',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    // Ground — ONLY left and right edges (center is void/zero-G)
    { x: 0, y: 660, width: 220, height: 60 },                  // Left deck
    { x: 1060, y: 660, width: 220, height: 60 },                // Right deck
    // === Left station stack ===
    { x: 30, y: 560, width: 170, height: 24 },                  // L level 1
    { x: 50, y: 460, width: 150, height: 24 },                  // L level 2
    { x: 30, y: 360, width: 170, height: 24 },                  // L level 3
    { x: 60, y: 270, width: 140, height: 24 },                  // L level 4
    // === Right station stack ===
    { x: 1080, y: 560, width: 170, height: 24 },                // R level 1
    { x: 1060, y: 460, width: 150, height: 24 },                // R level 2
    { x: 1080, y: 360, width: 170, height: 24 },                // R level 3
    { x: 1060, y: 270, width: 140, height: 24 },                // R level 4
    // No center platforms — zero-G jump boost covers the gap!
    // Crate blocks on decks
    { x: 100, y: 625, width: 45, height: 35 },                  // Crate L
    { x: 1140, y: 625, width: 45, height: 35 },                 // Crate R
  ],
  spawnPoints: [
    { x: 110, y: 540 }, { x: 1160, y: 540 },
    { x: 100, y: 340 }, { x: 1160, y: 340 },
    { x: 110, y: 640 }, { x: 1160, y: 640 },
  ],
  effectZones: [
    // ONE MASSIVE central zero-G zone covering the entire middle
    { x: 250, y: 200, width: 780, height: 480, type: 'zero_g' },
  ],
};

// ============================================================

const ARENA_LIST: Arena[] = [
  MEADOW_ARENA,
  WINTER_LAKE_ARENA,
  VOLCANO_ARENA,
  CASTLE_ARENA,
  CANDY_LAND_ARENA,
  TREETOPS_ARENA,
  UNDERWATER_ARENA,
  HAUNTED_GRAVEYARD_ARENA,
  ROOFTOPS_ARENA,
  SPACE_STATION_ARENA,
];

export function getArena(id: string = 'meadow'): Arena {
  const arena = ARENA_LIST.find(a => a.id === id);
  if (!arena) throw new Error(`Unknown arena: ${id}`);
  return arena;
}

export function listArenas(): Array<{ id: string; name: string; themeId: string }> {
  return ARENA_LIST.map(a => ({ id: a.id, name: a.name, themeId: a.themeId }));
}
