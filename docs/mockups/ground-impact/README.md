# Ground impact comparison

Four synchronized options: Current cracks, Chunky comic cracks, Brief ground dent, No ground mark. This is a docs-only motion study in the separate features/ground-impact worktree, based on fetched main 0e407a88. Production code is unchanged.

Current is frozen from rendering/surfaceImpact.ts with the actual fastMath lookup tables. Mini marks use five spokes, 12px radius and a five-second fade. Ice uses six forked spokes up to 28px and three seconds; glass uses 22px and two seconds. All marks retain horizontal clipping to their landing platform. The verifier compares the frozen drawing pixel-for-pixel against the current production module across ages, materials and clipping.

Chunky comic cracks adds bent ink paths, a light material-colored inner line and three small broken-edge shapes. It keeps the current surface-dependent lifetime. Brief ground dent uses a small dark bowl, uneven rim and upper highlight, disappearing after 550ms. No ground mark omits only the decal.

Every panel shares the existing 160ms fast-stomp impact crown or the hard-landing side puffs with the real production drawing functions and particle parameters. These are frozen in baseline-movement.ts.txt. Impact occurs at 0.4s, the character leaves after another 300ms, and the six-second loop exposes persistent marks. The shared-effects switch isolates the mark. Nineteen authored character atlases use jump/stomp, landing and walking poses. Surface strips are representative color swatches, not arena artwork; motion and squash are scripted, not simulation physics. Cover, camera shake, world lighting and slow-device suppression are not simulated.

Controls: character, fast stomp/hard landing, eight surfaces, clear ground/narrow ledge, shared impact effects, direction, day/night background, native/2x scale, speed, pause and scrub. The narrow ledge ends eight pixels beyond impact center to expose clipping.

Build: node docs/mockups/ground-impact/build-study.mjs. Frozen baseline files are created only when missing; regenerate the HTML without refreshing them. Verify: node docs/mockups/ground-impact/verify.mjs with Vite on port 4239 and a matching Playwright browser.

Validation: production-baseline pixel equality, four distinct options, matching pre-impact and expired frames, dent expiry while cracks remain, all nineteen characters, eight surfaces, both impact types, left/edge/night/2x/mobile checks and no browser errors passed. Tool ESLint passed. Inspected native, enlarged and edge captures. No runtime change; production build, Vitest and full game E2E were not rerun.

## Chunky shape variations

Added Wide zigzag split (two broad broken seams), Jagged fissures (three tapered dark cuts), Broken plates (four interlocking angular fragments), and Sparse forked cracks (fewer branching ink paths). All keep the current material-dependent fade and shared impact timing. The original four remain above them for comparison. Expanded browser checks passed for eight distinct frames, all 19 characters and eight surfaces, both impacts, edge clipping, expiry, night, 2x and mobile. The current baseline remains pixel-identical to production.

## Forked variations

Added Wide forked spread, Fine branching web and Heavy split with forks, making eleven comparisons. These share the existing material lifetime, contact anchoring and horizontal clipping.
