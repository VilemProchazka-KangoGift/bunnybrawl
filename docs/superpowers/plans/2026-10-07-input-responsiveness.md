# Input responsiveness

Restore responsive browser input without changing simulation physics, online fairness, or the synchronous per-tick PlayerInput contract used by bots and ML policies.

1. Measure browser key-event to simulation-input-read latency and the following render submission. Compare simulation-worker shared memory, simulation-worker message fallback, and main-thread simulation. Render submission is not display presentation.
2. Latch keyboard jump presses independently of held keys so a short press survives until the next reader. Forward local keyboard changes immediately rather than waiting for main-thread RAF. Keep touch polling.
3. Make the worker's asynchronous input boundary preserve pending jumps across neutral updates and consume them once when the player input is read. Shared memory must clear only the jump bit atomically; catch-up ticks must not repeat it. Leave RemoteInput and policy actions unchanged.
4. Give online HostLoop/GuestLoop exclusive ownership of input sampling. Local event forwarding and shared-memory reads must not overwrite fairness-delayed network batches. Preserve host/guest slot identity and repeated deliberate jump presses.
5. Add red-green tests for quick taps, uneven input/simulation rates, hitstop, batch deduplication, online ownership, and ML action recording. Run full Vitest, tsc/build, browser worker-mode regressions and local-relay online smoke, then repeat latency measurements.

Implementation areas: input/KeyboardManager.ts; worker/EngineWorkerProxy.ts, sabInput.ts, engineWorkerInit.ts and worker-owned PlayerInput; diagnostics and benchmark; corresponding input, worker, headless and browser tests. Network packet/schema, Simulator physics and PlayerInput/RemoteInput semantics remain stable.

## Implementation and timing evidence

Implemented on `features/input-responsiveness` in the dedicated responsive-input worktree, based on fast-stomp commit `99568e6`. Physics, network packet schemas, host fairness delay, RemoteInput and synchronous bot/ML policy semantics are unchanged. Keyboard events publish local levels immediately; complete taps remain pending at the asynchronous worker boundary until the simulator reads the player, then clear once. Pause discards pending jumps and resume publishes current held levels before restarting the worker.

Chromium production-preview measurements on 2026-10-07, 40 alternating press/release samples per mode, with varying event phase. Baseline used the original input delivery plus the same diagnostic probe; after used the new delivery. These are machine-specific observations, not a hardware latency guarantee.

| Mode | Input read p50 before / after | Input read p95 before / after | Render completion p50 before / after |
| --- | --- | --- | --- |
| Worker, shared memory | 26.94 / 7.76 ms | 43.73 / 18.79 ms | 28.42 / 9.17 ms |
| Worker, messages | 33.03 / 9.78 ms | 50.18 / 16.61 ms | 34.52 / 10.86 ms |
| Main simulation | 10.88 / 7.42 ms | 21.47 / 17.48 ms | 11.38 / 7.89 ms |

Main mode's render metric is renderer-proxy submission; worker modes measure worker render completion/submission. Neither includes OS input acquisition or physical display presentation. The small main-mode difference can reflect run variance; the worker path removes the extra main RAF wait. Raw local evidence is in ignored `perf-runs/input/{baseline,after}.json`.

To reproduce on the branch: build, start `npm run preview -- --host 127.0.0.1 --port 4191 --strictPort`, then run `node scripts/measureInputLatency.mjs http://127.0.0.1:4191/bunnybrawl/ 40 perf-runs/input/current.json`. Diagnostics are gated by `?debug=perf` and rejected in online mode. The production hot path does not decorate input or emit latency samples otherwise.

## Compatibility checks

WorkerInput owns copied transport values, never producer policy objects. Tests cover hitstop retention, single consumption across catch-up ticks, latest held levels, repeated deliberate network presses, slot identity, pause/resume, and exclusive host/guest sampling. RemoteInput tests keep repeated per-tick jump values unchanged; headless recording verifies every valid policy action remains unchanged. Browser tests block main RAF to prove worker delivery is event-driven in both shared-memory and message modes, and also cover complete main-thread taps and the previous fast-stomp fix. Local MQTT/WebRTC smoke checks host receipt of a guest quick tap and movement/release under normal, fallback and adverse networking.

## Completed validation

- Full Vitest: 160 files, 3,046 tests passed (`npx vitest run --maxWorkers=2`). Initial unrestricted run alongside build hit an interpolation wall-clock assertion and two graph-walker timeouts; bounded rerun passed with no unrelated source changes.
- `npm run build`: TypeScript `tsc -b` and production Vite build passed.
- ESLint on all changed/new runtime, test and benchmark files passed.
- Chromium: 16 focused input/fast-stomp/game-flow/arena-switch tests passed, including both simulation-worker and main-simulation modes. Command: `node node_modules/@playwright/test/cli.js test e2e/input-responsiveness.spec.ts e2e/fast-stomp.spec.ts e2e/game-flow.spec.ts e2e/arena-switch-mid-match.spec.ts --grep-invert '@flaky' --workers=2 --retries=0 --reporter=list`. Invoke the CLI directly and quote `@flaky` in PowerShell; an unquoted npm-wrapper invocation launched unrestricted workers and was interrupted.
- `npm run test:online-smoke`: all three local-relay WebRTC scenarios passed without retries: normal, message fallback, and simulated 80 ms latency / 20 ms jitter / 5% loss.
- Full Playwright suite and physical keyboard/display feel were not evaluated. The benchmark measures browser key events through simulation/render; it does not prove physical display latency.
- Read-only review of online/ML input ownership and pause/resume lifecycle found no remaining issue.
