# Visual improvement backlog

These are design opportunities, not approved gameplay changes. Start with **3: colour and depth** in Meadow, using comparable mockups before changing the game.

| # | Opportunity | Direction | How to judge it |
|---|---|---|---|
| 1 | Character prominence outside cover | Improve contrast for exposed characters. Keep Meadow bushes in front of players: hiding in them is intentional gameplay. | Exposed characters read clearly at normal gameplay size; a character inside a bush can still hide. |
| 2 | Platform materials | Refine grass lips and roots, chipped stone, and restrained volcanic seams. Bake shading into the artwork. | Platforms feel substantial and their collision edges stay obvious. |
| 3 | Depth through colour | Quiet distant scenery, separate near and far values, and choose a controlled palette for each arena. | Players and platforms read immediately in daylight and at night. |
| 4 | Illustrated arena previews | Replace emoji tiles with small illustrations rendered from the actual arenas. | Players recognize layout and atmosphere before selecting an arena. |
| 5 | UI art direction | Carry the logo's bold outlines and illustrated character into frames, badges, and typography. | Menus and HUD feel like the same game; labels remain readable. |
| 6 | Character silhouettes | Strengthen distinctive heads, ears, and bodies; simplify small details and harmonize outlines. | Characters are identifiable at gameplay size, including overlapping players. |
| 7 | Selective effects | Reduce routine trail and ambient clutter; reserve emphasis for stomps, danger, and victory. | Important events are obvious during a crowded five-player match. |
| 8 | Arena landmarks | Add a few memorable features: a crooked Meadow tree, broken Castle window, distinctive crater. | Arenas have identity without blocking players or landing edges. |

## First experiment: Meadow palette and depth

[Comparison mockups](mockups/meadow-depth/index.html) include the current renderer and three palette alternatives, each at noon and midnight:

- **A — Morning blue:** deeper blue overhead, pale horizon, cooler distant shapes.
- **B — Apricot sky:** rose and peach atmosphere, muted purple distance.
- **C — Deep teal:** cooler teal sky and darker slate distant shapes.

The mockups retain platform geometry, player artwork, decoration placement, HUD, and the existing lighting pipeline. They change sky, hill, distant treeline, and cloud colours only. Bush concealment is intentionally identical in every sample. They do not introduce shadows or change foreground occlusion.

There is no selected candidate yet. Evaluate all three at full size, then in moving gameplay with five players, representative character colours, stomps, and transitions through sunset. A still image does not establish gameplay readability or performance.

### Lessons from the abandoned lighting experiment

The saved Meadow reference in `.claude/worktrees/feat-lighting-l3-shadows` shows conspicuous rectangular dark regions crossing the sky. That screenshot is evidence of a poor visual result, not proof of a single cause. Avoid restarting the entire shadow pipeline for this experiment. Review one small visual change at a time against a fixed scene.

### Scope after choosing a direction

1. Tune Meadow colours in the arena pack using the chosen mockup as a reference.
2. Review daylight, sunset, midnight, and crowded moving gameplay.
3. Establish a reusable palette convention, then adapt it to the other arenas individually.

Related product ideas, including gamepads, remain in [the player experience backlog](player-experience-backlog.md).
