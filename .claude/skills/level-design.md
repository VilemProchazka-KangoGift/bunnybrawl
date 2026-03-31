# Level Design Skill

Use when creating or modifying arena levels, themes, platform layouts, or decorations.

## Canvas Dimensions & Physics

- **Canvas**: 1280 x 720 px
- **Ground**: always `platforms[0]` at y=660, height=60, full width
- **Player size**: 32 x 32 px
- **Max jump height**: ~174px (JUMP_IMPULSE = -560)
- **Max walk speed**: 280 px/s
- **Platform height**: 24px for floating, 60px for ground
- **Ground detection**: `p.y >= 650` identifies the ground platform

### Platform Spacing Rules

- **Vertically reachable**: platforms must be within ~170px of each other (jump height minus margin)
- **Horizontally reachable**: players can cover ~140px horizontally during a jump at full speed
- **Minimum gap for a challenge**: 100px horizontal, 150px vertical
- **Spawn points**: must be ~20px above their platform (y = platform.y - PLAYER_HEIGHT)

## Architecture

### Files to Modify

| File | Purpose |
|------|---------|
| `src/engine/themes/newTheme.ts` | Theme config (colors, particles, draw functions) |
| `src/engine/themes/registry.ts` | Register theme in THEMES map |
| `src/engine/themes/drawPrimitives.ts` | Add new shared drawing functions |
| `src/engine/arena.ts` | Platform layout + spawn points + themeId |
| `src/locales/en.json` / `cs.json` | Arena display name |

### Render Layer Order (back to front)

1. **Sky gradient** — `theme.sky.gradient`
2. **Hills** — `theme.hills` array (background silhouette shapes)
3. **Far background** — `theme.drawFarBackground?()` (mountains, distant forest)
4. **Platforms** — drawn from `theme.platform` config or `customDraw`
5. **Ground surface** — `theme.ground.surfaceColor` line + optional grass blades
6. **Background nature** — `theme.drawBackgroundNature()` (trees, snowmen, decorations BEHIND players)
7. **Clouds** — animated, from `theme.clouds` config
8. **Weather** — particles from `theme.weather` (leaves, petals, snow, embers)
9. **Wildlife** — from `theme.wildlife` (butterflies, birds)
10. **Game objects** — springs, thorns, carrots (engine-managed)
11. **Players** — characters with all effects
12. **Fog** — ground-level mist from `theme.fog`
13. **Foreground nature** — `theme.drawForegroundNature()` (drawn OVER players — large trees, pyramids, bushes)
14. **Ambient particles** — pollen/sparkles from `theme.ambientParticles`
15. **Day/night cycle** — sun, moon, stars, darkness overlay from `theme.dayNight`
16. **HUD** — scores, timer, kill feed (engine-managed)

### ThemeConfig Fields

```
id, nameKey, previewGradient          — identity + menu thumbnail
sky.gradient: GradientStop[]          — sky colors top to bottom
hills: {x, baseY, width, height, color}[]  — background hill shapes
ground: {surfaceColor, surfaceThickness, grassBlades?}
platform: {floatingBodyColor, floatingTopColor, floatingAccentColor?,
           groundBodyColor, groundTopColor, drawMoss, customDraw?}
clouds: {count, color, minSize, maxSize, minSpeed, maxSpeed, yRange}
weather: {particleCount, types: [{type, weight, sizeRange, vxRange, vyRange, rotSpeedRange, color?}]}
wildlife: {count, types: [{type, weight, colors, speedRange, yRange}]}
fog: {count, baseY, yVariance, speedRange, alphaRange, color, sizeX, sizeY}
ambientParticles: {count, sizeRange, vxRange, vyRange, alphaRange, colors}
dayNight: {enabled, cycleDuration, maxNightAlpha, showFireflies, showShootingStars}
physics?: {gravity?, friction?, walkSpeed?, jumpImpulse?}  — multipliers on base constants
```

### Weather Types

Built-in renderer support: `leaf`, `petal`, `snow`, `ember`, `ash`. Custom types need `drawWeatherParticle` override.

### Physics Modifiers

Multipliers on base constants (1.0 = default):
- `gravity` — affects fall speed and jump arc height
- `friction` — lower = more sliding (0.15 = very icy, 0.6 = slightly slippery)
- `walkSpeed` — horizontal movement cap
- `jumpImpulse` — jump height (lower = weaker jumps)

## Available Drawing Primitives

Import from `./drawPrimitives`. All take `(ctx, x, groundY, ...)` where groundY is the top of the surface they sit on.

### Meadow / General

| Function | Params | Notes |
|----------|--------|-------|
| `drawTree` | `x, groundY, size, colors?` | Deciduous tree with trunk + 3 foliage ellipses. Default green, customizable via `TreeColors` |
| `drawBush` | `x, groundY, size, colors?` | 3-ellipse bush. Customizable via `BushColors` |
| `drawFlower` | `x, groundY, color` | Stem + 5-petal flower + yellow center |
| `drawMushroom` | `x, groundY` | Red cap mushroom with white spots |
| `drawGrassTuft` | `x, groundY, color?` | 3 grass blades |
| `drawHill` | `x, baseY, width, height` | Background hill (quadratic curve). Must set `ctx.fillStyle` before calling |
| `drawCloud` | `x, y, size, color?` | 4-arc cloud shape |
| `drawPlatformMoss` | `edgeX, platY, platH` | Hanging moss drapes on platform edges |
| `drawTreeStump` | `x, topY, width, height` | Cut tree trunk with bark texture, annual rings, moss patches, side mushroom. Solid obstacle — use with matching platform |

### Foreground (drawn over players)

| Function | Params | Notes |
|----------|--------|-------|
| `drawFgBush` | `x, groundY, size, colors?` | Large detailed bush with berries. Customizable via `FgBushColors` |
| `drawTallGrass` | `x, groundY, bladeCount, darkColor?, lightColor?` | Cluster of tall grass blades |
| `drawFern` | `x, groundY, color?` | Fern with central stem + fronds |
| `drawHangingVine` | `x, topY, length` | Vine with leaves hanging from platform |
| `drawFgLeafCluster` | `x, platY, colors?` | 3 overlapping leaves on platform top |
| `drawFgWildflower` | `x, groundY, color, height` | Tall flower, bigger than `drawFlower` |

### Winter

| Function | Params | Notes |
|----------|--------|-------|
| `drawPineTree` | `x, groundY, size, snowCover?` | Conifer with 3 triangle tiers + optional snow |
| `drawChristmasTree` | `x, groundY, size` | Pine with colored ornaments, tinsel garlands, gold star with glow |
| `drawSnowDrift` | `x, groundY, width, height` | Snow mound with highlight |
| `drawIcePatch` | `x, groundY, width` | Transparent ice surface with shine |
| `drawIcicle` | `x, topY, length` | Translucent hanging icicle |
| `drawIceCube` | `x, topY, width, height` | 3D translucent ice block with top/right faces, internal cracks, frozen bubbles, shine. Use with a platform on top for jumpable obstacles |
| `drawSnowball` | `x, groundY, radius` | Single snow sphere with highlight + shadow |
| `drawSnowballPyramid` | `x, groundY, ballRadius` | 3-2-1 stacked balls (6 total). ballRadius 6+ on platforms, 8+ on ground |
| `drawLargeSnowballPyramid` | `x, groundY, ballRadius` | 4-3-2-1 stacked (10 balls) with depth shading. Foreground accent, radius 9-12 |
| `drawSnowman` | `x, groundY, size` | Decorative snowman (2-ball, eyes, nose, buttons). size 24-32 everywhere — never tiny |
| `drawBigSnowman` | `x, groundY, size` | Large 3-ball snowman with top hat, stick arms, buttons. size 80-140 |
| `drawIgloo` | `x, groundY, width, height` | Snow dome with ice block lines + dark entrance. width 150-300 |

## Decoration Design Principles

### Layering Depth

Use all 3 draw layers for visual depth:
- **Far background** (`drawFarBackground`): distant scenery at 15-35% opacity — mountains, treelines, cityscapes
- **Background** (`drawBackgroundNature`): full-opacity decorations behind players — trees, snowmen, landmarks, structures on platforms
- **Foreground** (`drawForegroundNature`): full-opacity decorations OVER players — large trees, bushes, snowball pyramids. Creates parallax depth

### Overlap Prevention (CRITICAL)

Before placing any decoration, check it doesn't overlap with:
1. Other decorations at the same y level (map all x positions first)
2. Foreground elements drawn at the same x (pyramids, trees)
3. Platform edges — decorations on platforms must fit within the platform width
4. 3D depth offsets (ice cubes extend ~30% width to the right and upward)

**Map x positions before drawing.** List all ground elements with their approximate x-span, then verify no two overlap. Same for each platform.

When adding solid obstacles (stumps, ice cubes), check ALL layers:
- Background decorations (bushes, flowers, mushrooms at same x)
- Foreground decorations (FgBush, tall grass drawn over players)
- Flowers array positions that fall within the obstacle's x-span
- Existing platform decorations in the loop

Remove or reposition any decoration that overlaps. Don't just add obstacles — audit the full x-position map.

### Solid Themed Obstacles (REQUIRED per level)

Every arena must have 2-3 solid themed obstacles on the ground that players can jump onto and collide with. These add verticality to the ground level and give each arena a distinct feel.

| Arena | Obstacle | Primitive | Typical size |
|-------|----------|-----------|-------------|
| Meadow | Tree stump | `drawTreeStump` | 55w x 45h |
| Winter Lake | Ice cube | `drawIceCube` | 60-65w x 50h |
| (New arenas) | Must add one | Theme-appropriate | 50-70w x 40-55h |

To create a solid obstacle:
1. Add a platform in `arena.ts` with **full collision height** (not 24px — match the visual)
2. Draw the visual in `drawBackgroundNature` at the **exact same coordinates**
3. Exclude obstacle platforms from decoration loops: `arena.platforms.filter(p => p.y < 650 && p.width >= 80)`
4. Place 2-3 on ground + 1-2 on wider platforms, spread out, avoiding overlap
5. Audit all decoration layers (background, foreground, flowers) for conflicts at those x positions

### Decoration Sizing — Keep Consistent

All decorations should be proportionally sized to the player (32x32px). Do NOT use tiny decorations on platforms — they look wrong against regular-sized players.

- **Snowmen**: size 24-32 everywhere (ground AND platforms). Never below 20.
- **Snowball pyramids**: ballRadius 6+ on platforms, 10+ on ground for large variant
- **Snowballs**: radius 4-5 on platforms, 7-12 on ground
- **Trees on platforms**: 20-48px depending on platform width. Keep proportional to the platform.

### Platform Decorations

Scale decorations to platform width. Every platform should have something:
- **350px+** (very wide): 2 trees + snowman + icicles underneath
- **200px+** (wide): 2 trees + snowman or snowball pair
- **140px+** (medium): 1 tree + decoration (snowman, pyramid, or snowball). Vary with `i % 3`
- **100px** (small): 1 item (tree, snowman, or christmas tree). Vary with `i % 3`

Use the platform index (`i % N`) to vary which decoration type appears, avoiding monotony.

### Tree Sizing Guide

- **Small** (20-28px): platform small/medium
- **Medium** (30-42px): platform wide, ground filler
- **Large** (45-55px): platform very wide, ground secondary
- **Foreground** (55-70px): ground only, drawn over players
- **Landmark** (75-90px): ground background, skyline-defining

### Ground Decoration Spacing

Keep ground SPARSE — platforms carry most of the visual interest. Ground should have:
- 3-5 trees spread across 1280px (not more)
- 1-2 snowmen or accent pieces
- 1 ice patch or feature
- Landmarks (big snowman, igloo) pushed to far edges

Avoid clustering. More is not better — clutter makes the playfield hard to read.

## Example: Creating a New Level

```typescript
// 1. Define theme in src/engine/themes/myTheme.ts
import type { ThemeConfig } from './types';
import { drawPineTree, drawSnowDrift /* ... */ } from './drawPrimitives';

export const MY_THEME: ThemeConfig = {
  id: 'my_theme',
  nameKey: 'arena_my_theme',
  previewGradient: 'linear-gradient(to bottom, #color1, #color2)',
  sky: { gradient: [{ offset: 0, color: '#top' }, { offset: 1, color: '#bottom' }] },
  hills: [{ x: 0, baseY: 620, width: 300, height: 100, color: '#hillcolor' }],
  ground: { surfaceColor: '#surface', surfaceThickness: 4 },
  platform: { floatingBodyColor: '#body', floatingTopColor: '#top', groundBodyColor: '#gbody', groundTopColor: '#gtop', drawMoss: false },
  clouds: { count: 4, color: 'rgba(255,255,255,0.6)', minSize: 50, maxSize: 80, minSpeed: 5, maxSpeed: 10, yRange: [40, 100] },
  weather: { particleCount: 30, types: [{ type: 'leaf', weight: 1, sizeRange: [3,6], vxRange: [10,30], vyRange: [15,35], rotSpeedRange: [1,3] }] },
  wildlife: { count: 3, types: [{ type: 'butterfly', weight: 1, colors: ['#FFD700'], speedRange: [15,30], yRange: [0.2,0.8] }] },
  fog: { count: 15, baseY: 655, yVariance: 10, speedRange: [3,8], alphaRange: [0.1,0.25], color: '#FFF', sizeX: 40, sizeY: 8 },
  ambientParticles: { count: 10, sizeRange: [1,2], vxRange: [-3,3], vyRange: [-8,-20], alphaRange: [0.2,0.5], colors: ['#FFF'] },
  dayNight: { enabled: true, cycleDuration: 120, maxNightAlpha: 0.6, showFireflies: true, showShootingStars: true },
  drawBackgroundNature: (ctx, arena) => { /* ... */ },
  drawForegroundNature: (ctx, arena) => { /* ... */ },
};

// 2. Register in registry.ts
import { MY_THEME } from './myTheme';
// Add to THEMES map

// 3. Add layout in arena.ts
export const MY_ARENA: Arena = {
  id: 'my_theme', name: 'My Theme', themeId: 'my_theme',
  width: 1280, height: 720,
  platforms: [
    { x: 0, y: 660, width: 1280, height: 60 }, // ground always first
    // ... floating platforms within jump reach of each other
  ],
  spawnPoints: [ /* 6 points, above platforms */ ],
};
// Add to ARENA_LIST

// 4. Add to locales: "arena_my_theme": "My Theme"
```
