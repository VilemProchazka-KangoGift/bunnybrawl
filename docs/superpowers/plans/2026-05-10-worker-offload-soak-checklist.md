# Worker offload soak checklist

**Window:** 14 days from merge (commit `b503426`, date 2026-05-10).
**Definition of done:** all rows ✅ for ≥7 consecutive days, and zero crash reports tied to the worker bundle.

## Daily smoke (5 min)

- [ ] Castle, 4 hard bots, 60s. No stutter, no missing SFX, victory screen renders.
- [ ] Waterfall, 2 medium bots, 60s. Mist particles + waterfall ambient OK.
- [ ] Mobile mode (`?mobile`), meadow, 2 bots, 30s. Touch input registers. Haptics fire on stomp.
- [ ] `?worker=off` regression: castle, 2 bots, 30s. Still works.

## Weekly cross-browser pass (15 min)

- [ ] Chrome stable (Windows): all 11 arenas play to completion at default settings.
- [ ] Firefox stable: same.
- [ ] Safari (macOS): same. Watch specifically for OffscreenCanvas v0.5 quirks.

## Online smoke (one host + one guest, weekly)

- [ ] Host on `?worker=on` (default), guest on `?worker=on`. Castle, 5 minutes. No desyncs visible to the guest.
- [ ] Repeat with one peer on `?worker=off`.

## Failure protocol

If any cell fails:
1. File the symptom in `docs/superpowers/specs/`.
2. If unfixable in <2 days, instruct users to set `localStorage['carrotroyale_worker'] = 'off'`.
3. If 3+ users hit the same symptom, revert the merge.

## Known limitations (not blockers for soak)

- **`?simWorker=on` in `npm run dev` is stuck in the loading screen.** Production builds (`npm run perf`, `vite preview`, GitHub Pages deploy) are unaffected — the issue is a pre-existing top-level-await ordering quirk specific to Vite's dev ESM serving. The `worker-strictmode-cold.spec.ts` regression spec skips the `?simWorker=on` row for this reason. Tracked separately; not on the Phase 1 critical path. The `?worker=on` renderer-only mode (the default and headline result) works fully in both dev and prod.
- **Worker offload requires browser support for OffscreenCanvas + module Workers.** Browsers without (very old Safari, some embedded webviews) automatically fall back to the main-thread `Renderer` at proxy-construction time via the `canvasesDetached` guard chain. No URL flag needed.

## Post-soak follow-ups

If the 14-day window passes cleanly:
- Remove the `?worker=off` user-toggleable kill switch (keep the browser-capability fallback). Plan Task 6 in `2026-05-10-worker-offload-ship-and-netmatch-async.md`.
- Investigate the `?simWorker=on` dev mode stall — likely a separate small fix once we understand why initEngine's tail never reaches main in dev.
- Begin Phase 2 (NetMatch async fixedUpdate) per the same plan doc.
