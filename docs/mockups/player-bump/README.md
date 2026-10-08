# Player bump variations

Three cosmetic studies using the actual cached Bunny sprite atlas and Meadow background:

- Stronger squash: 0.66 horizontal scale on contact, eased recovery.
- Contact flash: existing 0.8 squash plus a 0.12-second uneven cream-and-ink flash with a warm inset and two flecks.
- Short recoil: existing 0.8 squash plus a four-pixel outward pose displacement and small lean, returning within 0.18 seconds. This is a render offset, not physical knockback.

The Current reaction control shows the existing 0.8 squash in all panels. Pause, scrub, slow motion, game scale, detail scale, and night lighting support comparison. Selection persists through the conversation widget state.

These are scripted design studies. No runtime physics or renderer behavior is changed until a variation is selected. The background and poses are real assets; movement and contact timing are illustrative.

Build with `node docs/mockups/player-bump/build-study.mjs [absolute-inline-fragment-path]`. Verify with `node docs/mockups/player-bump/verify.mjs` (Playwright). Browser checks passed for controls, baseline pixel parity, selection persistence, 360px layout, and no page errors. Captures were inspected at game and detail scales.

Selected: Short recoil. Renderer-owned `BumpRecoil` detects a fresh 0.8 push squash beside another active body and gives both poses an outward four-pixel kick and small lean over 0.18 seconds. Direction comes from the touching body, not facing or velocity. Scale offset with player width. Never change physical positions, transport schemas, or wall squash; apply after drawing the shadow and before drawing the sprite. Holding contact must not restart the animation; reset on death. This works with worker and guest snapshots through the existing push marker. Live practice uses the real simulator with a stationary bot partner; fixture seeding is main-simulation only. Build, 149 focused Vitest tests, real collision browser capture, and four existing Playwright mode checks passed; full Vitest and full E2E suites not run.
