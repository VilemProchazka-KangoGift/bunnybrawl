# Respawn and protection comparisons

Current source now uses a soft warm radial glow, not the older pillar: 2.5-second sin-bell envelope, 0.15 peak intensity, radius 320. Baseline reproduces those parameters, twelve gold/orange spark samples and the current half-alpha blinking rule. The sparks use deterministic representative values; this is a scripted study rather than a simulator/audio replay.

- Cloud entrance: three inked cream clouds clearing within 550 ms; a cream silhouette outline follows the protected character.
- Inked pop: a strong irregular cream/green burst for 400 ms; three small orbiting stars show remaining protection.
- Ground ripple: two expanding ground rings over 550 ms; a cream-and-ink foot ring follows the protected character.

All alternatives include a brief squash/reveal. Protection starts with the spawn and lasts exactly the current 1.5-second INVINCIBLE_DURATION; all cues disappear together when it ends. The character begins moving after the entrance so persistence can be judged. No simulation, collision, timer, audio or runtime renderer changes yet.

All nineteen actual plush sprites are embedded with the Meadow backdrop. Supports pause/scrub, normal/slow motion, game/detail size, day/night and saved selection. Build with node docs/mockups/respawn/build-study.mjs [absolute-inline-path]. Verify with node docs/mockups/respawn/verify.mjs. Browser checks cover all characters, selection preservation, protection expiry and 360px layout, without page errors. Game/detail screenshots inspected.

Revision: keep the original half-alpha protection blinking on every option. Remove silhouette outlines, orbiting stars and persistent foot rings. Entrances are now more festive: larger cream clouds with 16 colored chips/ribbons/stars; Confetti pop with a 68-pixel irregular burst and 28 party pieces; Ground celebration with expanding rings and two fans totaling 24 party pieces. Celebrations clear in at most 0.85 seconds, while protection blinking continues for the unchanged 1.5-second window.

Cloud refinement: keep the big cloud reveal and original protection blinking; replace the 16 large colored pieces with eight tiny gold/orange flecks at 0.65 peak opacity and lower travel speed. Other alternatives unchanged.

Fleck visibility adjustment: eight gold/orange flecks now reach above the cloud canopy, are 2.2 by 3.2 logical pixel radii, and hold 0.95 opacity for the first 55 percent of their lifetime before fading. Count remains restrained.

Selected: Cloud entrance with the brighter eight flecks and original blink. Runtime emits one stationary respawnCloud particle with the full entrance drawn from its age. Clouds cover the feet after the player draw and before terrain overlays. Replaces the spawn ring and warm spawn light, preserves stomp light bursts and respawn land sound. Four SAB shape bits (24..27) preserve code 8 and all existing shapes; structured-clone path is unchanged. Production build and 189 focused Vitest tests passed. Live browser validation passed in both simulation modes and checked real respawn, cloud anchoring while moving, protection expiry and replay without page errors. Full Vitest and full E2E suites not run. Practice at docs/mockups/respawn/playtest.html.
