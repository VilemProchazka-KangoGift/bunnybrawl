# Castle atmosphere study

Castle is a fixed moonlit interior, with a painted window wall, pale limestone platforms, blue sconces, and the approved Guardian spring. This pass tests **three distinct color and light directions** in a matched 1280 × 720 renderer scene. Character sprites and foreground props retain their colors so their readability can be judged against each room treatment. The prior thorn samples are only comparison fixtures; no thorn art, collision, or placement changes are proposed here.

| Direction | Scene | Effect and tradeoff |
| --- | --- | --- |
| Current | ![Current Castle scene](atmo-current.png) | Restrained blue-gray, but the back wall, platforms, and guardian share a narrow range. |
| A · Silver Moon | ![Pale silver Castle](atmo-silver.png) | Pale blue wall and a broader moon glow; cleanest separation for dark props, though the room loses some depth. |
| B · Violet Vigil | ![Purple Castle](atmo-violet.png) | Deliberately theatrical violet shadows and lavender moon; distinct mood, but the purple platform tops compete with banners. |
| C · Ember Hall | ![Warm Castle](atmo-ember.png) | Warm stone and sconce pools against cool prop silhouettes; strong color contrast, but the existing blue flames would need a coordinated color change. |

My preference is **Silver Moon** as the safest refinement of the existing Castle identity. Ember Hall is the bolder option if Castle should feel warmer; Violet Vigil shows the upper limit of saturation rather than a recommended production grade. The [gallery](index.html) presents all four full scenes at matching size.

The [grade study source](grades.ts) remaps only the static background canvas pixels and adds broad radial light pools. This is a fast way to explore palettes **in the mockup**, not a proposed runtime pixel loop. If one direction is approved, implement it by changing the baked painted plate and static Canvas palette, and coordinate emitter colors separately. Keep player sprites, thorn silhouettes, collision, and background/foreground draw order intact. Then verify the production scene and moving effects in both worker modes.
