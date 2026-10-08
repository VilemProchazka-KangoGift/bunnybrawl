# Lava / burn comparison

Current glow is frozen from rendering/players.ts: five-second timer, radial orange/yellow overlay and original pulse formula. Alternatives retain it as a quiet sustained status cue and add an immediate burst, smoke or pose reaction. Shared scripted knockback is schematic; pose embellishments do not change physics. No runtime effect is selected or changed yet.

19 authored plush characters, synchronized timing, normal/slow playback, detail zoom, night contrast and saved choice. Build with `node docs/mockups/burn/build-study.mjs [inline-path]`; verify with `node docs/mockups/burn/verify.mjs`.

Browser verification checks eight distinct variants, all 19 characters, selection persistence, pause/scrub, detail/night, sustained burn, full recovery and 360px layout. Captures are in `captures/`.

Scorch expansion: Soot bloom (dense cloud and ash), Twin chimney (two foot jets), Smoky spiral (curling staggered puffs), Ember cough (two smoke chuffs with warm ember cores). Original Scorch puff and other comparisons remain available.

Selected Ember cough is implemented in runtime. Live practice: playtest.html. Uses actual lava collision helper, retained gameplay knockback/hitstop and original glow. capture-live.mjs verifies main-simulation lava contact through the renderer worker and both-mode boot.

