# Meadow leaf comparisons

Current leaves, ink-edged leaves, curled leaves, no leaves. Uses 30 scripted weather particles with Meadow's 60% leaf / 40% petal mix, original 3–6px leaf sizes, velocity ranges and rotation. Petals remain identical in all cards. Draw through Renderer’s actual weather slot so platform and player occlusion match the game. Explicit logical-size compositing supports high-DPI backing stores. Day/night controls; production unchanged.

Build `node docs/mockups/meadow-leaf-cues/build-study.mjs`, serve `test-results/leaf-static` with Vite preview.
