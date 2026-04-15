# Carrot Royale — Progress Log

## Stats
- **28 commits** across 2 sessions
- **~7800 lines** of TypeScript/TSX/CSS
- **90 unit/integration tests** + **6 E2E tests**
- **14 playable characters**, **2 languages** (Czech default, English)

## Features Implemented

### Core Gameplay
- 2D platformer arena with 9 platforms across 3 tiers
- Up to 5 players on shared keyboard (P1:WASD, P2:Arrows, P3:IJKL, P4:FGHT, P5:Numpad)
- Stomp-to-kill mechanic with head detection
- Fast-fall (down key) with instant velocity snap + 2.67x gravity
- Player-player horizontal collision with momentum transfer
- Horizontal screen wrapping
- Persistent splat marks (character-specific shapes: paw, star, blob, ring)
- Respawn with invincibility + safe spawn point selection

### Characters (14 total)
Bunny, Fox, Frog, Bear, Owl, Cat, Wolf, Panda, Pig, Cow, Goat, Horse, Sheep, Monkey
- Each has unique procedural sprite, animal sound, and splat shape
- Cat has distinctive green slit-pupil eyes, whiskers, upright tail (visually distinct from Fox)

### Lobby (Jump'n'Bump Style)
- Canvas-based character select with all characters on screen
- Random character assignment on enter
- Stomp NPCs to swap into their character (NPCs respawn far away)
- Wall obstacle at 2/3 of screen forces jumping to reach ready zone
- Fast-fall works in lobby for easier stomping
- No side collisions (walk through each other freely)
- Countdown starts when 2+ players enter the green zone
- Control schemes displayed at top with arrow unicode icons
- Animal sounds play when entering ready zone

### Pickups & Hazards
- **Carrots**: spawn every 10s (ground or mid-air), +1 point, makes rabbit fat for 10s (bigger, slower, lower jump). Spawn VFX. Min 150px from other carrots.
- **Spring mushrooms**: spawn randomly on platforms, bounce rabbits high (-700px/s), grow-in animation, despawn after 20s
- **Thorns**: spawn randomly, slow rabbit for 5s on hit, break on first contact with blood splash + shrapnel VFX + sound + screen shake

### Visual Effects
- Squash/stretch on jump, land, crouch, wall hit
- Afterimage ghost trail behind fast characters (blue when invincible)
- Kill streak flame aura at 3+ kills
- Stomp shockwave ring
- Screen flash on final kill + slow-motion (25% speed, 1 second)
- Dust particles: landing (scales with impact), running, wall/ceiling impacts
- Platform crumble debris on hard landing
- Kill splatter (confetti or blood based on gore mode)
- Character shadows, breathing animation, blush near carrots
- Facial expressions (scared, angry, dizzy)
- Character-specific idle animations (ear twitch, tail wag, blink, etc.)

### Environment
- Day/night cycle (120s) with sun/moon arcs, stars, fireflies
- Sun light rays during daytime
- Shooting stars during night
- Animated clouds drifting across sky
- Falling leaves and cherry blossom petals
- Background hills, trees, bushes, flowers, mushrooms
- Foreground hiding bushes (mixed sizes on all platforms)
- Platform edge moss
- Ground fog layer
- Pollen/dandelion seeds floating upward

### Audio
- Procedural music loop (chiptune)
- 14 unique animal sounds (chirp, yip, ribbit, growl, hoot, meow, howl, oink, moo, bleat, neigh, baa, screech, soft chirp)
- Jump, stomp, victory, select SFX
- Thorn hit sound (sharp stab + descending pain)
- Footsteps (grass crunch on ground, wood tap on platforms)
- Countdown beeps (3-2-1-GO!)
- Ambient background noise
- Crowd cheering (volume ramps near kill limit)
- Oof on wall impact, splash on puddle

### Screens
- **Main Menu**: Fredoka font, floating title animation, gore toggle (persisted), language switch (EN/CS), Enter to play
- **Lobby**: Canvas-based JnB-style with wall, nature, polished UI bar
- **Match**: Two-layer canvas, HUD with scores/timer/kill feed, pause menu (ESC/Enter)
- **Victory**: Fireworks canvas, scoreboard, per-player stats, character lineup with emojis, MVP awards, keyboard shortcuts (Enter=rematch, Esc=menu)

### UI/Polish
- Fredoka font throughout
- Animated score popups on kills/carrot pickup
- Kill feed with character color dots
- Timer turns red and pulses in last 30 seconds
- Damage direction indicator (red flash)
- Frosted glass pause menu
- Dark pill backgrounds for text readability

### i18n
- Czech (default) and English
- All UI strings, character names, MVP labels
- Language toggle on main menu

### Testing
- 90 unit/integration tests (Vitest): physics, stomp, input, arena, characters, store, components
- 6 E2E tests (Playwright): menu flow, lobby, match start, keyboard shortcuts
