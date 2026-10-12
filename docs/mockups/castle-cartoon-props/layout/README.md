# Castle prop layout: gallery and side supports

The long upper landing looked empty while the two armor guards crowded the ground. The edge columns were half-clipped and did not appear attached to the room. This pass reuses the approved art at new positions; arena geometry, collision, and spawns are unchanged.

| Previous Balanced Silver layout | Gallery and supports |
| --- | --- |
| ![Previous Castle layout](../atmosphere/live-balanced-default.png) | ![Improved Castle layout](gallery-and-supports-default.png) |

The guards now stand near the ends of the 780 px upper gallery. Its center remains clear for the player spawn at x=640 and for the moon/window silhouette. The columns are smaller, fully visible, and aligned under the lowest side ledges instead of cropped against the viewport edges. They render behind players, so they do not create new foreground hiding. The existing sconces, chandelier, banners, Guardian springs, and all platform positions remain in place.

The [default worker](gallery-and-supports-default.png) and [`simWorker=off`](gallery-and-supports-simWorker-off.png) captures come from the playable production preview after countdown. Both modes loaded the Castle art and completed a Meadow-to-Castle switch without page errors. This is a layout proposal for visual review; assess the motion of characters crossing the upper gallery and side supports before merging the PR.
