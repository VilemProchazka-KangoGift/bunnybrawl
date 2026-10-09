# Invincibility trail comparison

Current blue ovals, Blue irregular clouds, Small shield sparks, Blinking only. All 19 characters share the current protection blink: 100 ms alternating full and half opacity, derived from the remaining timer. Protection begins at 0.1 s and lasts 1.5 s. No footstep particles are shown.

Current freezes the existing afterimage emitter and renderer: 30 Hz cosmetic ticks, residual 30 ms cadence, maximum five entries, 4/s alpha decay, swap-remove expiry, 32×32 body-relative ovals, and blue #88BBFF hue shifts. During protection the trail emits even while stationary. baseline.mjs preserves the current emitter. Blue irregular clouds replaces only the oval silhouette with the selected ordinary-speed six-lobe cloud. Small shield sparks uses four small blue diamonds that brighten and rise near the shoulders; Blinking only omits the extra protection decoration. All options retain the original character blink.

After expiry all panels display the selected ordinary speed clouds above 200 px/s; stationary residual trails drain. Those shared post-expiry frames are checked for equality. This is a scripted camera-follow study, not a runtime override. It does not simulate respawn entrance clouds, diving, slow-device suppression, foreground cover or full engine lighting. The night option tests background contrast. Surface choices are colored contact strips over the same Meadow crop.

Build: node docs/mockups/invincibility-trail/prepare.mjs, then node docs/mockups/invincibility-trail/build-study.mjs. Verify: node docs/mockups/invincibility-trail/verify.mjs with Vite on port 4235 and a matching installed Playwright browser. Browser checks passed for distinct cues, blink, identical pre/post protection frames, 19 characters, standing/running/left direction, eight surfaces, night, 2× and 360 px layout. Captures inspected. Tool ESLint passed. This docs-only study changes no production source; production build, Vitest and game E2E not rerun.

Separate worktree features/invincibility-trail starts at fetched main a3b3de5. No variant is selected by default.
