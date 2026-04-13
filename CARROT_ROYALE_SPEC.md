# BunnyBrawl — Game Design Specification
**Version 1.0 | March 2026**

---

## Overview

BunnyBrawl is a local-multiplayer party game loosely inspired by Jump 'n Bump (1998). Up to 4 players share a single keyboard, controlling cartoon animals on a 2D platformer arena. The goal: land on opponents' heads to splat them. Last bunny standing (or highest score at time limit) wins.

Phase 1 is a React + HTML5 Canvas prototype focused on core feel. Phase 2 ports to Unity with network play and extended content.

---

## Phase 1 — React + Canvas Prototype

### Goals
- Establish core game feel: jumping, collision, and splat mechanics
- Validate fun before investing in Unity
- Deployable in browser (Vite + React, canvas rendered at 60fps)

### Core Loop
1. Players select characters on a start screen
2. Match loads a single arena
3. Players jump around, stomping each other
4. A score ticker tracks kills; round ends at kill limit or timer
5. Victory screen shows winner; rematch or quit

---

### Physics

**Movement**
- Horizontal acceleration + friction (not instant velocity). Snappy but not instant.
- Max walk speed: ~280px/s
- Jump: fixed impulse upward; no variable jump height in phase 1
- Gravity: constant downward pull (~900px/s²)
- No double jump in phase 1

**Collision**
- Players are axis-aligned bounding boxes (AABB)
- Platforms are static horizontal rectangles
- Arena wraps horizontally (walk off left → appear on right)
- No ceiling collision — jumping into the top of the screen feels bad; cap velocity instead

**Stomp detection**
- Attacker's bottom edge overlaps victim's top edge
- Attacker must be moving downward (vy > threshold)
- Victim must not currently be splatted
- On stomp: victim enters splat state, attacker gets a small upward bounce

---

### Characters

Phase 1 ships with 4 characters. Each is visually distinct but mechanically identical in phase 1 (stats differentiation is a phase 2 feature).

| Slot | Character | Color |
|------|-----------|-------|
| P1 | Bunny | White |
| P2 | Fox | Orange |
| P3 | Frog | Green |
| P4 | Bear | Brown |

Each character has 3 sprite states: **idle**, **run**, **airborne**. Sprites are simple pixel art or placeholder colored rectangles for prototype.

---

### Splat System

When a player is stomped:
- They enter a flat "splat" animation (squish sprite, ~0.4s)
- A persistent blood/confetti splat mark is painted to the background canvas layer
- After the splat animation, the player respawns at a random spawn point
- Splat marks accumulate for the full round — screen gets progressively messier

Phase 1 uses colored circles/blobs as splat marks (no gore sprites needed for prototype).

---

### Arena

Phase 1 has one arena: **Meadow**. Designed to fit a 1280×720 canvas.

**Platform layout (approximate):**
```
                    [   ]
          [     ]            [     ]
    [  ]                               [  ]
[                                              ]  ← ground
```

- Ground spans full width
- 2–3 mid platforms, 1–2 high platforms
- Spawn points: above each platform, staggered per player

The arena background is a static image (or solid color + simple CSS gradient for prototype).

---

### Controls

All 4 players share one keyboard:

| Player | Left | Right | Jump |
|--------|------|-------|------|
| P1 | A | D | W |
| P2 | ← | → | ↑ |
| P3 | J | L | I |
| P4 | F | H | T |

Gamepad support is phase 2.

---

### Match Settings

| Setting | Default | Range |
|---------|---------|-------|
| Kill limit | 10 | 5–30 |
| Time limit | 3 min | Off / 1–5 min |
| Player count | 2 | 2–4 |

Match ends when either limit is hit first.

---

### Screens

**Main Menu** — Title, Play, Settings, Credits

**Character Select** — 4 slots; each player presses their jump key to ready up; inactive slots are CPU (phase 2) or closed

**Match** — Arena + HUD overlay (score per player, timer, kill feed last 3 events)

**Victory Screen** — Winner announced, final scores, Rematch / Menu buttons

---

### Audio (Phase 1)

Minimal. Web Audio API or Howler.js.

- Jump sfx
- Stomp/splat sfx
- Short victory jingle
- Optional looping background track (can be silent)

No music licensing concerns — use royalty-free or generated audio.

---

### Tech Stack (Phase 1)

| Concern | Choice |
|---------|--------|
| Framework | React (Vite) |
| Rendering | HTML5 Canvas (two layers: background/splats + game objects) |
| Game loop | `requestAnimationFrame` with fixed timestep (16ms) |
| State | useReducer or Zustand for game state outside canvas |
| Sprites | PNG spritesheets or SVG for prototype |
| Audio | Howler.js |
| Deployment | Vercel or GitHub Pages |

React is used for menus/HUD only. The canvas loop is imperative and lives outside React's render cycle.

---

## Phase 2 — Unity

### Goals
- Production-quality feel, performance, and cross-platform builds
- Online multiplayer
- Content expansion
- Mod/custom level support

### Core Changes from Phase 1

**Engine**
- Unity 2D (URP)
- Rigidbody2D with custom physics layer for precise stomp detection
- Cinemachine for camera shake on stomp events

**Multiplayer**
- Unity Netcode for GameObjects (NGO) or Fusion
- Online 2–4 players; local still supported
- Rollback netcode strongly preferred for responsiveness — evaluate Photon Fusion

**Characters**
- Full animation rigs (idle, run, jump, fall, stomp, splat, respawn)
- 8 characters at launch, each with unique stats:
  - Speed / Jump Height / Stomp Radius / Respawn Invulnerability Duration

**Arenas**
- 6 arenas at launch
- Each arena has a theme affecting splat visual (mud, paint, slime, etc.)
- Arena hazards: moving platforms, bounce pads, spike zones

**Splat System Upgrade**
- Persistent decal system using render textures
- Splats fade out slowly over time (prevents total visual chaos in long matches)
- Unique splat shape per character

**Match Modes**
| Mode | Description |
|------|-------------|
| Deathmatch | Kill limit, standard |
| Timed | Most kills in time limit |
| Last Bunny Standing | Lives system, last alive wins |
| King of the Hill | Hold a zone to score |

**Progression (optional / stretch)**
- Cosmetic unlocks (hats, trails, splat colors)
- No pay-to-win; purely aesthetic

**Level Editor**
- In-game drag-and-drop platform placer
- Export/import as JSON
- Share codes (short URL or clipboard)

---

## Out of Scope (Both Phases)

- Single-player campaign
- AI opponents (phase 1); basic bots are phase 2 stretch
- Mobile / touch controls
- 3D gameplay — strictly 2D

---

## Open Questions

1. **Name** — BunnyBrawl is a placeholder. Confirm or pick.
2. **Art style** — Pixel art vs. vector/cartoon? Pixel is faster for prototype; cartoon scales better to Unity.
3. **Splat tone** — Cartoonish (confetti/paint) vs. mildly gory (blood blobs)? Affects rating and audience.
4. **Phase 1 CPU players** — Placeholder bots for solo testing, or always require 2 human players?
5. **Rollback netcode** — Photon Fusion ($) vs. NGO + custom lag compensation (free but harder)?
