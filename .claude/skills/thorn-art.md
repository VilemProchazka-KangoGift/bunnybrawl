# Thorn artwork

The approved default hazard is Leafy Dark Briar. See
`docs/mockups/thorn-briar/README.md` for concept and production comparisons.

- Use tall ochre points, dark connected crossing vines, and sparse attached leaves.
  Keep the leaves below the tips and preserve open gaps so it remains a hazard at
  the 28 px native width rather than reading as a decorative bush.
- Keep the lower leaf on the descending front vine with a gap from the upper-right
  leaf. The final approved placement is `leaf-position-revision-2.png`; pushing it
  upward toward the right leaf made the two leaves appear connected.
- The authored paths in `rendering/thornArt.ts` extend about 14.5 px above the base;
  this is artwork, not a change to the 28 x 12 collision box. Preserve the platform
  growth pivot and shared fade lifecycle in `drawThorn`.
- Keep arena-specific `drawCustomThorn` overrides. Do not replace themed hazards
  when changing the shared plant artwork.
- Verify naturally spawned hazards in both worker modes. For matched day/night
  captures, pin the same thorn state in `simWorker=off` and render again before
  capture; changing the worker proxy's mirror does not change its simulation.
- Match the approved illustration's broad proportions (roughly 1.95:1), rounded
  thorn collars, curved tapers, thick crossing vines, and broad leaves. The first
  28 x 22 procedural approximation was rejected: narrow triangular spikes and
  flat thin vines lost the reference's shape and volume.
- Detailed static Path2D color planes are cached once per renderer realm in a
  transparent OffscreenCanvas, with the same vector artwork as a capability
  fallback. Preserve the transparent ink margin, growth/fade transforms, and
  ambient compositing; no external assets or per-frame allocations are needed.
