# Kill camera punch comparisons

Fresh branch from main 93c42470. Four options: Current, Tighter zoom, Directional kick, Softer punch. Production source is unchanged.

This Vite-served study imports the actual Renderer, plush roster, ParticleSystem and canonical state factories. All options share a scripted stomp at 0.5 seconds, the current production splat drawing, kill splatter (including blood mode), expanding shockwave, victim hitstop/red flash and the newly selected score flash. Physics, bots, sound and network transport are not exercised. The study uses the production splat state; it does not invent a separate death atlas.

Current uses the unmodified renderer camera block: 3% quadratic zoom over 0.12s, centered at (640,360), and random ±6px shake over 0.3s. The random stream is seeded per frame solely for repeatable comparisons. The static background and dedicated HUD are untransformed, matching the layer architecture. Other options transform the foreground before invoking the same renderer with its camera timers disabled. The score flash stays on the separate HUD layer.

Tighter zoom uses 4%, 0.16s and an impact anchor clamped to arena bounds, with ±3px shake over 0.16s. Directional kick uses 2% zoom over 0.12s and a 9px downward sine kick with one rebound over 0.18s. Softer punch uses 2% zoom over 0.18s plus a 1.8px damped oscillation over 0.18s.

Controls: normal/quarter speed, pause/replay, timeline, center/left/right impact, all 19 victims, blood mode, day/night and focused game-size view. Reduced motion starts paused.

Run Vite on port 49057 and open `/bunnybrawl/docs/mockups/kill-camera-punch/index.html`. Verify with `node docs/mockups/kill-camera-punch/verify.mjs`. This checks browser loading, variants, controls, roster, blood/day/night, focused/mobile layout and screenshots; it is a renderer study, not production worker validation.

Each card has live zoom (0-10%) and shake (0-20px) amplitude sliders plus Reset. Timing and motion style remain the chosen card preset. Zero disables that component independently; unmodified Current uses the production renderer camera block.
