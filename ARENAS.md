# BunnyBrawl — Arena Levels

## Architecture Changes Needed

- [ ] Add `theme` field to `Arena` type (drives which background/decoration renderer to use)
- [ ] Refactor `renderBackground` in renderer.ts to dispatch per theme (instead of hardcoded meadow)
- [ ] Each theme defines: sky gradient, platform style, ground style, decorations, ambient particles
- [ ] Add arena selector UI on MainMenu (thumbnail buttons or horizontal carousel)
- [ ] Store selected arena in `matchSettings` (Zustand store)
- [ ] Add arena name to locales (en.json, cs.json)

## Arenas

### 1. Meadow (current) — DONE

- **Sky/BG**: Blue sky gradient
- **Ground**: Green grass
- **Platforms**: Brown wood + moss
- **Decorations**: Trees, flowers, mushrooms
- **Ambient FX**: Butterflies, birds
- **Layout**: Balanced symmetric

### 2. Winter Lake

- **Sky/BG**: Gray-white overcast
- **Ground**: Snow/ice (white)
- **Platforms**: Frozen logs (blue-gray)
- **Decorations**: Pine trees, snowmen, icicles
- **Ambient FX**: Falling snow particles
- **Layout**: Wide frozen lake at bottom
- **Gameplay modifier** (optional): Lower friction (slippery)
- **Status**: Not started

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

## Optional Per-Arena Gameplay Modifiers

These are stretch goals — purely visual theming with different platform layouts comes first.

- **Winter**: Lower friction (slippery ice)
- **Space**: Lower gravity
- **Underwater**: Lower gravity + slower movement
- **Treetops**: No ground — falling off the bottom kills you
