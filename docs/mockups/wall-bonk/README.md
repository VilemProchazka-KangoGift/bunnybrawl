# Wall bonk variations

Compare **Contact ticks**, **Star pop**, and **Squash only** in `index.html`.
All three use the real Bunny atlas and painted Meadow background, with a scripted run into an illustrated platform face. They are animation studies, not live collision captures. No production behavior changes yet.

Contact ticks add three uneven cream-and-ink accents for 0.14 seconds. Star pop adds a small irregular star with a warm inset for 0.16 seconds. Both retain the existing 0.75-width squash. Squash only deepens compression to 0.62 width and recovers over 0.19 seconds without a graphic. Current reaction shows the ordinary 0.75-width compression without added marks. The night setting is an approximate palette check.

Pause and scrub around 0.4 seconds to compare contact. Zoom, slow motion, both wall sides, and selection controls are shared across the panels.

Worktree: `wall-bonk-variations/rabbits`, branch `features/wall-bonk-variations`. Integrate after selection. Collision feedback should key off a real wall contact (`sideSquash = 0.75`), distinguish player pushes (`0.8`), and avoid treating a released movement key as a wall collision. Holding into a wall must not repeatedly flash the effect every tick.

Rebuild with `node docs/mockups/wall-bonk/build-study.mjs`; verify with `node docs/mockups/wall-bonk/verify.mjs`. Chromium checks passed for all three panels, pause/scrub, zoom, both wall sides, night, baseline pixel parity, selection persistence, and a 360px layout without browser errors. Game-size and detail/day/night captures were visually inspected. These checks cover the comparison only; real collision/worker validation follows selection.

Wall bonk selection: Squash only. Shared `WALL_BONK_SQUASH = 0.62` applies to platform walls and lobby boundaries; player pushes stay at 0.8. Recover horizontal compression in Simulator before platform collision every fixed step (same exponential recovery as lobby), so held contact stays stable and release returns to normal. The gallery uses a linear prototype recovery; the live game uses eased recovery. No new particles. Live practice: `/bunnybrawl/docs/mockups/wall-bonk/playtest.html`; `capture-live.mjs` verifies contact, held compression and complete release recovery against the real main simulation and renderer worker.
