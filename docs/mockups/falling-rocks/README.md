# Falling-rock warning cues

Compare Current glow, Chunky dust, Motion streak and Plain rock. Current has an orange circular glow but no trail. Plain rock deliberately omits both glow and trail while preserving the jagged body and hot cracks. Dust and streak options retain Current glow/body.

The rock renderer is frozen verbatim in baseline-rock.ts.txt and transpiled into baseline-rock.js. The backdrop, terrain, plush characters and HUD come from the actual Volcano Renderer. Three scripted rocks share position, size and rotation in all cards. Controls cover the real 8-16px size and 150-300px/s fall-speed ranges, normal/quarter-speed playback, timeline and full-arena focus. Reduced-motion starts paused. Rocks pass through platforms and players for repeatability: collision, burn, impact particles, audio and camera are omitted. The trail is composited above the arena for the study; a chosen production trail must use the correct hazard layer and match collision lifetime.

Build with node docs/mockups/falling-rocks/build-study.mjs. Serve test-results/rock-static at /bunnybrawl/ on port 49059. Verify with node docs/mockups/falling-rocks/verify.mjs. Production is unchanged.

Round 2 keeps Current + Chunky dust and adds four combined silhouettes: Ruffled glow + rolling dust, Comet glow + ash puffs, Comic burst + chunky dust, Broken halo + scattered dust. These preserve the frozen rock body/hot cracks while replacing only its glow fill. Trail cadence, spread, puff size and ash palette vary. All eight options share the same rock positions, rotation, size and speed.
