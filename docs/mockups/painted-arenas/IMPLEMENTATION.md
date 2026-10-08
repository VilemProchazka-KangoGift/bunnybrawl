# Approved background implementation

The nine approved paintings are selected production assets for Rooftops, Treetops, Waterfall, Volcano, Castle, Haunted Graveyard, Candy Land, Underwater and Space Station. Space Station uses the weathered interior with dark outer space and stars. Meadow and Winter Lake are excluded from this work.

Exact selected file sizes and SHA256 hashes are recorded in [approved-assets.json](approved-assets.json). The current [gameplay gallery](README.md) shows those settings beneath real platforms and characters. Archived source editions remain available for comparison.

The illustrated backdrop registry fetches the selected arena image and decodes it in the canvas-owning renderer realm before play. Paintings are baked into the static background cache. Optional image-load failures retain the procedural fallback. Clouds are integrated into the paintings, while existing moving wildlife and weather remain animated. Collision geometry, spawn points and physics are unchanged. Waterfall water stays animated and starts visually at the painted cliff lip, without extending its force zone.

Production build (`tsc -b` and Vite), scoped ESLint and 134 focused Vitest tests passed on the final approved set. The 34-case production Playwright run passed 32 cases and timed out on Treetops and Waterfall in `simWorker=off`. Separate serial reruns passed both arenas in both worker modes (four cases), so every selected case has passing evidence, with the initial timing failures retained. These checks cover direct entry, arena switching, image-load fallback, Meadow loading and gameplay smoke flows. Approved live captures use `*-live-approved-*` filenames.

Full test suites were not run. Work is local; no commit, push or deployment was performed.
