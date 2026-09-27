# Carrot Royale — Arena Levels

## Architecture

Theme system lives in `src/engine/themes/`. See AGENTS.md "Adding a new arena" for the step-by-step pattern.

### Progress

- [x] Phase 1: Foundation types (`themes/types.ts`, update `types.ts`, `themes/drawPrimitives.ts`)
- [x] Phase 2: Meadow extraction (`themes/meadow.ts`, `themes/registry.ts`, update `arena.ts`)
- [x] Phase 3: Renderer + GameLoop refactor (dispatch to theme config, parameterize physics)
- [x] Phase 4: Winter Lake theme + arena layout + UI selector + locales
- [x] Phase 5: Tests + visual QA

## Arenas

### 1. Meadow (current) — DONE

- **Sky/BG**: Blue sky gradient
- **Ground**: Green grass
- **Platforms**: Brown wood + moss
- **Decorations**: Trees, flowers, mushrooms
- **Ambient FX**: Butterflies, birds
- **Layout**: Balanced symmetric

### 2. Winter Lake — IN PROGRESS

- **Sky/BG**: Dark blue-gray gradient (`#2C3E6B` -> `#B8C8DC`)
- **Ground**: Snow-white surface (`#E8F0F8`), frozen earth below, no grass blades
- **Platforms**: Blue-gray body, snow-white cap, no moss, icicles hanging off edges
- **Decorations**: Pine trees with snow, snow drifts, frozen lake (ice patch), snowmen
- **Ambient FX**: 50 snow particles (dense), blue-white fog, drifting snow sparkles
- **Wildlife**: 2 dark birds, no butterflies
- **Day/Night**: Enabled, no fireflies, shooting stars on
- **Layout**: Wide center platform, ice shelf sides
- **Physics**: `friction: 0.6` (icy sliding)
- **Status**: Done

### 3. Volcano

- **Sky/BG**: Dark red/orange sky
- **Ground**: Dark basalt rock
- **Platforms**: Obsidian/lava-cracked stone
- **Decorations**: Lava pools (animated glow), dead trees
- **Ambient FX**: Rising ember particles, heat shimmer
- **Layout**: Asymmetric, gaps in ground with lava below
- **Status**: Not started

### 4. Castle / Night

- **Sky/BG**: Night sky + moon + stars
- **Ground**: Stone brick floor
- **Platforms**: Stone brick platforms
- **Decorations**: Torches (animated), banners, suits of armor
- **Ambient FX**: Torch flicker particles
- **Layout**: Tall vertical layout, many small ledges
- **Status**: Not started

## Backlog / Future Ideas

| Theme | Sky/BG | Key visuals | Layout twist |
|-------|--------|-------------|--------------|
| Candy Land | Pink/pastel gradient | Lollipops, wafer platforms, gummy bears | Bouncy, curved layout |
| Treetops | Deep green canopy | Branches, vines, nests, acorns | No ground — fall = death |
| Underwater | Deep blue gradient | Coral, seaweed, treasure chest | Floaty physics (lower gravity) |
| Haunted Graveyard | Purple-black night | Tombstones, dead trees, jack-o-lanterns | Fog, spread-out spacing |
| Rooftops | Sunset city skyline | Chimneys, antennas, clotheslines | Gaps between buildings |
| Space Station | Starfield + nebula | Metal grating, control panels, wires | Low gravity, wraparound edges |

## Per-Arena Physics Modifiers

Supported via `ThemeConfig.physics` (multipliers on base constants):

| Arena | gravity | friction | walkSpeed | jumpImpulse |
|-------|---------|----------|-----------|-------------|
| Meadow | 1.0 | 1.0 | 1.0 | 1.0 |
| Winter Lake | 1.0 | 0.6 | 1.0 | 1.0 |
| Volcano | — | — | — | — |
| Castle | — | — | — | — |
| Space Station | 0.5 | 1.0 | 1.0 | 0.8 |
| Underwater | 0.6 | 1.2 | 0.7 | 0.9 |
| Treetops | 1.0 | 1.0 | 1.0 | 1.0 |
