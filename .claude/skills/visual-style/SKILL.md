---
name: carrot-royale-visual-style
description: Use for Carrot Royale arena or character visual redesigns, procedural Canvas art, background palettes, foliage, platforms, and visual mockups. Keep characters readable against backgrounds while preserving intentional foreground hiding.
---

# Carrot Royale visual style

Use the [complete Meadow day](../../../docs/mockups/meadow-backgrounds/production-day.png) and [night](../../../docs/mockups/meadow-backgrounds/production-night.png) captures as the arena art reference. They show the production renderer, not isolated asset drawings. The [Pocket Bunny study](../../../docs/mockups/character-styles/README.md) is the character direction and iteration record; its playable version is still opt-in. Apply the visual language to other arenas without copying Meadow's green palette or plant motifs into every setting.

## Start with the design brief

Before drawing, identify the arena or asset being changed, the gameplay information it must show, and any deliberate occlusion it must preserve. Capture the current production scene with representative characters at noon and night. Note what is actually failing: silhouette, color separation, platform readability, depth, repetition, or clutter. State one visual goal for the iteration so a prettier detail does not distract from the problem being solved.

For a new arena, choose a setting-specific palette and landmarks, then apply the hierarchy and shape rules below. For an existing arena, preserve its gameplay geometry and behavior unless the task explicitly includes changing them.

## Visual hierarchy

1. Characters, hazards, pickups, and landing surfaces must be recognizable immediately at the game's 1280 × 720 logical size and when displayed smaller.
2. Playable platforms have clear tops, visible depth, and a distinct boundary against the scenery.
3. Foreground cover may hide characters where the game deliberately uses it as cover. This is a gameplay exception to character visibility, not a reason to make the whole background blend with players.
4. Distant scenery supplies atmosphere with broad, quiet shapes and less contrast and detail than the playfield.

## Drawing language

- Aim for a hand-drawn storybook look: rounded but irregular silhouettes, restrained dark outlines, layered color, and a few intentional interior marks. Avoid uniform circles, airbrushed gradients, and texture everywhere.
- Give every large prop a coherent mass. Attach leaves and blossoms to that mass so a bush reads as a living plant rather than a rock or a loose pile of leaves. Keep the outline uneven and botanical.
- Vary silhouettes and detail density. A dense hedge, an open leafy bush, and a flowered thicket should be distinguishable at a glance, even when their colors are similar.
- Keep highlights and tiny details secondary to the silhouette. At match scale, the shape must still work after petals, veins, or pebbles become too small to see.
- Meadow's olive ink (`#334937`), greens (`#31523c`, `#6d8c4c`, `#a3b966`), warm earth (`#ad7953`), and pale yellow blossoms (`#f1d56e`) are references for their *roles*. Choose equivalent colors that suit each new arena.

## Backgrounds: contrast with characters

- Design sky, hills, distant trees, and other backdrops around the character roster, not as standalone illustrations. Aim for a clear difference in value, hue, or both behind each character. Check light, dark, warm, and green characters; a palette that suits Bunny may lose Frog.
- Prefer muted, cooler, lower-detail distance layers behind saturated character colors and crisp foreground outlines. Meadow's morning-blue sky and softened hills are one example, not a universal background color.
- Keep the busiest background edges away from common movement lanes, spawn points, and platform tops. Use broad shapes and atmospheric separation so moving characters remain easy to track.
- Check noon, sunset, and night. A night tint must retain enough separation for dark characters and platform edges; bright sky or lighting effects must not wash out pale characters. If a character disappears, first adjust the backdrop's value, saturation, or local detail.
- Judge contrast in the full scene at native size and at a smaller display size. A quick grayscale or squint check exposes value collisions that hue alone can hide. Review moving gameplay as well as still screenshots.
- **Keep deliberate cover opaque.** Foreground bushes render over players and are supposed to hide them. Improve readability of the rest of the scene without thinning, fading, or moving those bushes solely to expose characters.

Check characters against each major background zone they cross: open sky, hills or distant scenery, platform top, and ground. Test pale, dark, warm, and green characters rather than judging the palette with one favorite character. If one disappears, adjust the layer behind it first: simplify nearby edges, shift value or hue, or reduce saturation. Recheck the entire scene after the change so another character does not lose contrast elsewhere.

### Landscape and cloud lessons from Meadow

- Make distant shapes read as the intended place. Meadow's sharp repeated treeline read as mountain peaks; broad rolling contours and sparse tree silhouettes read as a valley. Keep far trees smaller, quieter, and visibly attached to their ground plane.
- Tune **height and spacing**, not just palette. The first valley study left the hills too low. Raise the far ridge enough to be seen between lower platforms, then raise middle and near slopes by smaller amounts so the layers remain distinct. Keep the highest platforms and upper jump lanes against open sky.
- Use uneven, continuous hill contours instead of repeated semicircles. Give each depth layer its own cool, muted value; avoid dark outlines and tiny texture in the distance. The near layer may be stronger, but must still sit behind players and their opaque cover.
- A cloud is a silhouette, not a stack of equal circles. Elongated, irregular forms with restrained underside detail suit the storybook props. Compare cloud shape separately from land shape, then review the combination. Preserve slow cloud drift and wrapping when integrating a static mockup into the game.
- Treat a large edge canopy or scenic landmark as a possible obstruction. A woodland frame looked attractive in isolation but crowded Meadow's outer platforms, so it was dropped. Leave quiet space wherever players jump or the HUD sits.
- Compare full production-renderer scenes at fixed player positions and day/night phases. Keep the selected mockup and the old scene available together; after integration, capture the real game again. A static mockup does not prove animated clouds or night compositing work in production.
- At night, compare props baked into the background with live foreground props and characters. Tint painted foreground pixels with the same ambient color and alpha as the background night variant. A full-screen DOM blend can double-tint the background while leaving foreground props too bright. Keep transparency clear so foreground bushes still hide characters without a tinted rectangle.

Meadow's [background comparison gallery](../../../docs/mockups/meadow-backgrounds/README.md) records the alternatives, height studies, and production result. Its height variants are a useful example of changing composition without moving gameplay geometry or modifying character art. The valley and cloud shapes live in [`meadowBackdrop.ts`](../../../src/engine/arenas/packs/meadowBackdrop.ts); Meadow's cloud configuration supplies starting positions to the existing animated cloud system.

## Meadow reference props

| Prop | What to preserve |
| --- | --- |
| Leafy bush | An irregular crown with visible attached leaves and small warm accents. |
| Hedge bush | A denser, continuous foliage silhouette with clustered leaf texture. |
| Flower thicket | The former Berry shape, with pale yellow five-petal blossoms in place of its berries; no exposed branch structure. |
| Flowers and mushrooms | Simple readable storybook shapes, sized in proportion to 32 × 32 characters. Use accents sparingly. |
| Trees and secondary foliage | A grounded trunk with connected, irregular foliage; tapered grass and ferns; vines that hang visibly from platform edges. Keep motion and player-parting behavior. |
| Small wildlife | Readable silhouettes and limited ink detail at match scale; keep their existing movement and avoidance behavior. |
| Platforms and stumps | A visible top cap, warm front face, darker side face, inked edge, and enough irregularity to feel organic. Preserve the fake 3D depth. |

When a ground platform reaches the viewport boundary, extend its drawing beyond both screen edges so its cap and soil do not expose vertical endpoints. Keep collision bounds and playable top unchanged, and extend any foreground body-cover clip by the same amount.

The three bush styles coexist in Meadow. Their current placement and drawing live in [`meadowSelectedArt.ts`](../../../src/engine/arenas/packs/meadowSelectedArt.ts), while the trees, secondary foliage, and small wildlife live in [`meadowStorybookDetails.ts`](../../../src/engine/arenas/packs/meadowStorybookDetails.ts), with placement in [`meadow.ts`](../../../src/engine/arenas/packs/meadow.ts). Background bushes sit behind players; opaque foreground bushes draw over them. Platform front-face overlays also draw after players, preserving the sense of moving behind the terrain. Art changes must preserve the collision plane and these layer relationships.

## Characters: a soft toy with readable acting

**Design direction, not a completed roster conversion.** The [character study gallery](../../../docs/mockups/character-styles/README.md) compared several looks. Soft toys were the promising family; Pocket Plush became the playable Bunny experiment. The other animals are still static concept studies, and the original procedural Bunny remains the default. Treat the opt-in `?pocketBunny=1` Bunny as evidence for a method and a visual direction, not as proof that one silhouette, face, or atlas will work for every animal. Before converting a pack, inspect its species features, gameplay states, current drawing, and actual arena backgrounds. The implementation and cache contracts are in [`character-sprites.md`](../character-sprites.md).

### What the player should feel

The roster should feel like a cast of small, lively storybook toys in a playful competition. Each animal needs a distinct personality, but all should remain warm and appealing even while attacking or losing. Acting must survive at match scale: **silhouette and body pose carry the action, face reinforces it, fabric detail finishes it.** A small mouth or eyebrow change alone cannot carry a fast action. Do not turn every animal into the same plush body with a different head ornament.

| State or beat | Emotion to convey | Shape and acting cue | What to avoid |
| --- | --- | --- | --- |
| Resting idle | Safe, curious, quietly alive | Comfortable stance, clear gaze, small timed blink or attentive change; subtle breathing is optional. | A frozen cutout or constant bouncing that makes stillness impossible. |
| Occasional idle sit and held sit | Relaxed, cozy, self-possessed | One balanced seated silhouette with visible paws and a stable contact point. Add a small foot-anchored sway when the seated character starts moving. | A strained squat that reads as taking a poop; instant frozen sliding when movement begins. |
| Walk or run | Eager, purposeful, a little mischievous | Alternating foot contacts, a passing pose, shifting limbs and body weight; species features follow the motion. | Translating or rotating a rigid sprite while the feet and arms stay identical. |
| Jump and airtime | Exertion followed by buoyancy | Clear separation from the grounded pose: lifted feet, changed limb reach, and an appropriate ear, tail, wing, or body response. A landing pose returns the weight to the ground. | Stretching the standing picture into an airborne picture; identical expression and limb arrangement throughout. |
| Fast stomp | Brief, comic determination and anger | A dedicated downward attack silhouette, compressed intent in arms and feet, and a face readable at speed. Bunny's swept ears, clenched paws, narrowed eyes, and gritted mouth are one solution. | A barely changed falling pose, detached generic eyebrows, or a threatening expression that loses the game's charm. |
| Landing or impact | Soft weight, surprise, resilience | Contact, bent or gathered limbs, and a short recovery that still looks like the same animal. | A large generic squash that flattens its anatomy or confuses the attack and landing shapes. |
| Scared, dizzy, or other status expressions | A legible interruption of the usual confidence | Adapt the pack's eyes, face, and posture to the actual gameplay cue; preserve the action and species silhouette underneath. | A face overlay whose coordinates drift as the head changes pose. |

These are **acting goals for future packs**, not a claim that the Bunny prototype has a unique frame for every beat. Its present atlas has ten authored poses, including three walk shapes, a single jump, fast stomp, impact, blink, attention, idle, and seated. If a species needs extra anticipation or recovery frames, add them because they improve the live action, then check load and cache cost. Keep input response immediate; an attractive transition must not make the character feel sluggish.

The gameplay state and the emotion are separate layers. `idle`, `run`, and `airborne` determine the base pose; crouch, fast fall, landing, idle actions, and the `normal`/`angry`/`scared`/`dizzy` expressions can modify what is shown. Write down precedence before drawing combinations: an airborne fast stomp needs to read as an attack; a seated character must still respond to movement; an expression must remain attached to the moving face. `splat` and `respawning` are also player states, but the current renderer handles the splat separately from the character pose atlas. Decide whether a redesigned animal needs species-specific impact art and test the existing respawn presentation rather than silently assuming every state uses the new atlas.

### Shape, material, and identity

- Start with a recognizable species silhouette and a personality brief. Decide what its ears, wings, muzzle, tail, horns, or feet do in motion. Use different mass distribution and stance across the roster: a round bear, long-eared Bunny, wide-footed Frog, and compact Owl should not share a body template merely to simplify packing. These are shape prompts, not approved final designs.
- Preserve the same character through every pose. Compare head-to-body ratio, torso width, cheek shape, face placement, limb thickness, and appendage roots side by side at the **final packed size**. Dynamic poses may change contour, but a fast stomp must not look like a thinner or much fatter replacement animal. Bunny's first angry drawing lost its roundness; the next export at 36 game pixels looked too fat. Packing that same round-bodied art at 32 pixels brought its width into line with the jump pose. Those numbers describe Bunny, not a roster-wide size rule.
- Use a continuous, confidently dark ink edge that stays legible over the scene. Keep the interior soft: matte color planes, restrained shading, and sparse seam or fabric suggestions can evoke a toy without making it dirty or overworked. The ink should define the silhouette, not form a bright cutout halo. Inspect light and dark characters over Meadow's day and night zones before adjusting an outline globally.
- Attach anatomy cleanly. An ear or limb may overlap the body, but its root must read as joined; do not leave transparent gaps, leaked background pixels, or scar-like cut lines across the forehead. A plush seam is intentional only when it reads as construction at match scale.
- Give each animal a few repeatable identity marks and expressive features, then keep them placed consistently in all poses. Avoid tiny decorations as the only way to tell two characters apart. Do not add a foreground glow or outline that reveals a player through an opaque bush: hiding behind that cover is deliberate gameplay.

There are **19 built-in animals** in [`builtin.ts`](../../../src/engine/characters/builtin.ts). The five-character style gallery covers Bunny, Fox, Frog, Bear, and Owl only. Use these as starting tests across different body types, then audit every remaining pack before claiming roster coverage:

| Body family to test | Animals | Distinctions the new art must preserve or deliberately redesign |
| --- | --- | --- |
| Long-eared, tailed, or striped mammals | Bunny, Fox, Cat, Wolf, Tiger | Ear profile, muzzle and cheek shape, tail mass, and markings; do not let four tailed heads collapse into one plush face. |
| Heavy or compact bodies | Bear, Panda, Pig, Rhino, Hedgehog | Different shoulder and belly mass, Panda face patches, Pig snout, Rhino horn, Hedgehog spines; check whether short limbs remain readable while walking. |
| Hooves and wool | Cow, Goat, Horse, Sheep | Hoof contact, horns or long muzzle where present, and the difference between a wool mass and a smooth body. |
| Unusual proportions | Frog, Monkey, Axolotl | Frog's eye and foot placement, Monkey's tail and hands, Axolotl's external gills; keep appendages attached through aggressive poses. |
| Birds | Owl, Chick | Beak and wing language, feathered silhouette, and leg/foot scale; a seated or attack pose cannot simply borrow Bunny's arm positions. |

This table is a **coverage checklist**, not a set of approved personalities. For each animal, write a short brief before making art: three recognition cues visible at match size; a one-line emotional baseline; how it shows effort, playfulness, anger, and recovery; the appendage that can provide secondary motion; the outline and light/dark color planes; its nearest lookalike in the roster; and the background zone where it is hardest to see. If a suggested pose changes a species cue, record the intended replacement. Let the cast share material and ink while giving each animal its own timing and weight.

Check silhouettes without color and faces, then flat colors without texture, then the complete scene. Compare similar-looking animals beside each other and put all five possible players on screen: movement, overlap, and small display sizes may erase differences that look obvious in enlarged concept sheets. Check warm, pale, dark, and green bodies over every arena palette. The background should usually move to restore contrast, but a face or chest plane may need adjustment when a dark character loses its expression at night. Do not make opaque cover translucent to solve this.

### Build motion from poses, then add restraint

The first Pocket Bunny animation tried to rotate ears and limbs cut from a flat illustration. The missing art behind those joints showed through, the forehead looked scarred, and the torso stayed stiff. Author complete poses with the volume, face, appendage roots, and ink redrawn together. At minimum, review resting, walking contact and passing, jump, fast stomp, landing, and seated behavior for each redesigned animal. Test an actual run and jump sequence; a row of attractive stills does not demonstrate life or responsiveness.

Small transforms can support an authored performance, but they should not *be* the performance. For Pocket Bunny, the generic run bounce and lean, landing squash, fast-fall stretch, and shared transform-based idle actions are skipped; the poses carry the large changes. Its idle sit and player-held grounded crouch share the same appealing seated drawing. Starting to move from a sit gets a short seated exit cue, and moving while crouched gets a small sway anchored at the feet. Apply the principle to another species by asking what its weight and anatomy would do, not by copying Bunny's exact timer or wobble.

Make the edge as carefully as the pose. Stamping a heavy outline around the finished low-resolution Bunny produced jagged steps. The prototype extends the silhouette by a fraction of a logical pixel at 4× display resolution, composites the pose on top, then downsamples once; it suppresses the generic outline so a second ring is not added. Check the result at actual game size, not only at zoom. Similarly, the generic angry eyebrows drifted over the differently shaped authored heads and seated movement. The Bunny pack suppresses those eyebrows and paints its angry face into the stomp pose. If a future pack uses shared expression overlays, anchor them to that pack's moving face and verify every relevant pose.

### Pose and asset construction checks

- Keep every pose registered to the same ground contact and body center. Check the transition by toggling adjacent frames in place, not by viewing each crop separately. The head, feet, and facial features may move intentionally; accidental jumps in position make the animation look like it jitters. Keep consistent transparent padding and enough room for ears, horns, wings, tails, or attack shapes so they are not clipped.
- Design the cycle for the **actual state timing**. Contact and passing drawings must give an alternating gait, not a repeated upper body with swapped feet. A jump pose must work during sustained airtime as well as the first instant off the ground. If one pose cannot express rising and falling clearly, prototype another pose and measure the added cost. Landings should return cleanly to idle or run without a visible size jump.
- Check both facing directions. The renderer can mirror the art, so asymmetrical markings, hair, seams, or accessories will swap sides. Decide whether that is acceptable per animal; if it changes identity or creates an anatomical error, provide direction-specific art or revise the design. Keep eyes and expressions coherent after mirroring.
- Pack only what the runtime needs at a size appropriate to the game. Retain editable source artwork and the packing method separately, with a named pose map and enough provenance to regenerate the atlas. Inspect dark outlines and transparency after downsampling; a crisp enlarged source can become jagged, muddy, or fringed at display size. Follow the pure draw and sprite-cache contracts in [`character-sprites.md`](../character-sprites.md).
- Verify the character through the whole render stack: the match, the character-selection lobby, and any other preview using the pack. Check built-in legs versus authored legs, generic highlight and outline flags, bubble helmets, power-up scaling, invincibility flashing, status tint, and splat or respawn. Preserve existing collision and gameplay behavior; artwork must not imply a smaller hitbox or a different landing surface than the one players actually have.

### Why the Bunny direction changed

| Observation in the experiment | Decision and transferable reason |
| --- | --- |
| Early character style studies looked poor in the game; only the soft toy family seemed usable. | Keep Pocket Plush as the working direction and test it as a playable Bunny before promising a roster redesign. Judge concepts in the production renderer, not solely as full-size art. |
| The first playable plush looked stiff, and its limbs barely moved during walk and jump. | Replace the flat cutout rig with complete authored poses whose limbs and body weight change. Movement must be visible without relying on squash, rotation, or bounce. |
| Rotated ear attachments leaked and the forehead looked scarred. | Redraw connection points in each full pose and inspect transparent edges over contrasting backgrounds. |
| A stronger low-resolution outline looked jagged or halo-like. | Build the dark edge at source resolution, downsample once, and avoid stacking the renderer's generic outline on it. |
| The first explicit sit looked strained, while the idle sit felt natural. | Use the calm idle seated silhouette for both idle and input-held sit; make movement from that shape perceptible with a restrained, grounded sway. |
| Fast stomp was too close to ordinary airtime, then its first angry art was too slim; a wider export looked too fat. | Differentiate the attack through silhouette **and** expression, then compare all poses at their packed game size. Adjust art scale and anatomy together before changing the established character proportions. |
| Generic angry brows floated away from the authored face. | Put the expression in the authored pose or tie any reusable overlay to pose-specific facial anchors. |
| Bright foreground art and dark background at night gave inconsistent lighting. | Evaluate the character in the complete day/night scene, with foreground ambient tint and intentional opaque bush cover intact. |

The [Pocket Bunny comparison and iteration record](../../../docs/mockups/character-styles/README.md) contains live scene crops, the motion preview, atlas, and retained failed variants. Use it to understand *why* a choice was made. Treat the preview GIF as a keyed illustration; gameplay and timing must be checked in the running arena.

### Roster redesign workflow and acceptance checks

1. **Brief one animal.** Record its current silhouette, palette, species landmarks, and the emotional signature it should bring to the cast. Choose one or two ways its acting differs from Bunny. Keep the shared storybook ink and softness while preserving that species' identity.
2. **Explore at match size.** Compare genuinely different proportion and face treatments, not small recolors. Put resting, walk, jump, stomp, and seated studies beside the current character and the selected Pocket Bunny. Include uncolored silhouettes and side-by-side nearest roster lookalikes. Check the whole roster together so the new animal does not become a duplicate or an outlier in scale.
3. **Make a playable slice.** Author the key poses, load a compact atlas or equivalent cacheable asset, and wire state selection. Preserve facing, power-up scale, hitbox and physics, and the foreground draw order. Keep the current pack available for a fair comparison until the new one is accepted. Record which poses are actually implemented and which emotions or special states still use shared rendering.
4. **Review emotions in motion.** Can someone identify idle, sit, walk, jump, fast stomp, and impact from the silhouette at normal speed? Is fast stomp angry and distinct while still cute? Do feet contact the ground and do appendages stay attached? Does the character retain its body shape across poses and directions? Watch crouched movement and transitions, not only still frames.
5. **Review the complete game view.** Compare matched day, sunset, and night captures over sky, hills, platforms, and ground, at 1280 × 720 and a smaller display size. Check character selection as well as a match, with nearest roster lookalikes and multiple moving players. Test pale, dark, warm, and green roster mates together. Let opaque bushes hide players as designed. Evaluate both the default simulation worker and `?simWorker=off` if rendering integration changes.
6. **Check delivery cost and decide.** Compare cold arena entry, decoded asset size, frame time during a busy match, and play feel against the current pack on available devices. An efficient warmed sprite draw does not prove startup is fast. Save matched screenshots or short motion captures, the source-to-atlas mapping, and a brief record of the chosen and rejected variants so later animals can use the evidence. Record which parts are approved visual direction, which are implemented, and which remain untested before expanding to the next animal.

Advance one animal only after its in-game acting and scene comparisons hold up. The roster is ready when its members feel related by material and ink, individually recognizable by shape and motion, and readable outside intentional cover across the supported lighting states.

## Redesign and review loop

1. **Explore distinct directions.** For a broad redesign, make several variants that change a meaningful dimension such as silhouette, foliage structure, platform treatment, or backdrop palette. Label what each variant tests. Do not produce near-duplicates distinguished only by tiny color shifts.
2. **Compare fairly.** Render the current scene and candidates through the actual arena and renderer, with the same camera, character positions, and time of day. Show both the whole arena and a crop of the changed prop when detail matters. Save durable PNGs or static previews in the repo so the comparison remains accessible after a local server stops.
3. **Select the direction.** For arenas, review in this order: gameplay silhouette and landing surfaces; character contrast outside deliberate cover; cover and terrain occlusion; coherent shape language; color and fine detail. For characters, use the acting and roster checks above, beginning with action silhouettes and stable identity across poses. For a user-facing design choice, present the comparisons and the tradeoffs before applying the chosen direction throughout production.
4. **Integrate without changing gameplay accidentally.** Preserve collision tops, platform front-face overlay, and foreground hiding. Keep detailed static scenery in the background and foreground caches. Avoid expensive gradients, shadows, or large numbers of new paths in the per-frame draw path; see [`performance.md`](../performance.md).
5. **Verify the full scene.** Compare noon, sunset, and night at 1280 × 720 and at a smaller display size; watch live gameplay with different characters and player positions. For character work, also review every authored pose in motion, including transitions, with the old character beside it. Check the default simulation worker and `?simWorker=off` when rendering changes. If the Meadow composition changes intentionally, refresh and rerun the visual baseline in `e2e/lighting-baseline.spec.ts`.

### When a candidate fails

| Symptom | First design adjustment |
| --- | --- |
| Bush reads as a rock | Break up its outline with attached leaf groups and botanical asymmetry. |
| Bush reads as a pile of leaves | Add a continuous underlying crown and show how leaves grow from it. |
| Platform looks flat | Restore a clear top cap, warm front face, and darker side face without moving its collision top. |
| Character is lost against scenery | Quiet or shift the scenery behind that character; test the rest of the roster again. |
| Scene is busy despite attractive props | Remove repeated accents or detail near movement lanes before adding more effects. |
| Night scene loses silhouettes | Retune distant values and night tint while keeping foreground cover opaque. |

A direction is ready to carry forward when its whole-scene comparison shows readable characters outside intentional cover, clear playable surfaces, distinct prop silhouettes, and no loss of the arena's gameplay cues. Keep unresolved tradeoffs visible in the comparison rather than claiming the artwork is finished.

For arena geometry and draw-layer contracts, also read [`level-design.md`](../level-design.md). For character silhouette and sprite-caching rules, read [`character-sprites.md`](../character-sprites.md).
