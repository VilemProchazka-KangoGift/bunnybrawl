# Player Experience Backlog

Captured: 2026-09-28

Status: proposed ideas for future selection. Documenting an idea does not approve its implementation. Effort is relative, not a delivery estimate.

## Recommended next opportunity

**Party mode** is the recommended next feature: connect individual matches into a group session with standings, arena rotation, and an overall winner. It builds on the existing rematch flow and match statistics.

**Gamepad support** is a separate core-input opportunity: let friends bring controllers and mix them with keyboard players. Its priority depends on how the group normally plays and whether controllers are available for hardware validation.

## Overview

The numbered priorities preserve the ordering of the eight follow-up suggestions. Gamepad support was proposed separately.

| Priority | Idea | Player benefit | Relative effort |
|---|---|---|---|
| 1 | Best-of-five party mode | Gives a sequence of rematches shared standings and an overall winner. | Medium |
| Core input | Gamepad support with press-to-join | Lets local players use individual controllers alongside keyboard players. | Medium–large |
| 2 | Playable tutorial | Teaches movement, stomping, and fast-fall through practice. | Medium |
| 3 | Online invitation links | Opens the joining flow with the room code already filled in. | Small |
| 4 | Custom keyboard bindings | Lets each player choose comfortable keys and avoid binding conflicts. | Medium |
| 5 | Match presets | Starts Quick Match, Beginner Friendly, or Chaos Party with one selection. | Small |
| 6 | Arena voting between rounds | Gives everyone a say in where the next round takes place. | Medium |
| 7 | Local player names | Keeps player identities recognizable across character changes and rounds. | Small–medium |
| 8 | Last-stomp replay | Replays the winning moment on the victory screen. | Large |

## Best-of-five party mode

- Track round results and cumulative standings across a local session.
- Rotate arenas and display session progress between rounds.
- Show an overall winner and offer a new series.
- Decide scoring and tie rules before implementation. With three to five players, a fixed five-round series is different from a two-player first-to-three-wins match; the UI must explain the chosen rules.
- Start with local play. Online series would additionally need host-owned session state and synchronization.

## Gamepad support with press-to-join

- Press a controller button in the lobby to claim an available player slot.
- Mix controllers and keyboard players within the existing five-player limit.
- Support movement through the D-pad or stick, jump, and fast-fall.
- Display controller assignments, detect disconnection, and allow reconnection without changing player identity.
- Poll browser gamepad state on the main thread and feed the existing input abstraction and worker input transport. Keep browser APIs outside the pure simulator.
- Validate with real controllers as well as automated input tests, including both supported worker modes. Menu navigation, nonstandard mappings, and rumble can be considered after the first playable version.

## Playable tutorial

- Add a short practice arena with sequential movement, jump, stomp, and fast-fall objectives.
- Give immediate feedback when the player completes each action.
- Use safe targets and simple obstacles so players can learn at their own pace.
- Allow replaying or skipping the tutorial. The existing text help remains useful as a reference.

## Online invitation links

- Provide a copyable room invitation link in the online lobby.
- Opening the link should enter the joining flow with the room code filled in.
- Validate the code and explain expired or unavailable rooms.
- Keep name/character selection and the final join action clear; define how invitation parameters coexist with existing development shortcuts.

## Custom keyboard bindings

- Let each local player remap movement, jump, and down/fast-fall actions.
- Detect duplicate assignments and explain conflicts before saving.
- Persist layouts through `safeStorage` and offer a restore-defaults action.
- Keep help text and lobby control labels consistent with the selected bindings.
- Key remapping does not remove a keyboard's hardware limitations on simultaneous presses; controller support addresses a different part of the local-play experience.

## Match presets

- Offer Quick Match, Beginner Friendly, and Chaos Party presets using existing match settings, bot difficulties, and modifiers.
- Show a concise description of each preset's rules.
- Allow players to adjust settings after applying a preset.
- Decide concrete preset values during implementation; these names are suggestions, not finalized balance settings.

## Arena voting between rounds

- Let players vote before the next round and show the winning arena.
- Resolve tied votes randomly and keep the interval between matches short.
- Define abstention, voting controls, and timeout behavior.
- Local player input devices and online host-authoritative voting need different adapters. Choose the initial supported mode before implementation.

## Local player names

- Let local players enter short display names in the lobby.
- Keep names attached to player identity when characters change or rounds restart.
- Show names in match results and future series standings.
- Retain readable defaults for unnamed players and define name length and duplicate-name handling.
- Consider this alongside party mode, where stable identities have the most value.

## Last-stomp replay

- Keep a bounded recording of the final seconds and replay the winning stomp on the victory screen.
- Allow skipping the replay and continuing to rematch immediately.
- Handle wins without a final stomp, including time-limit and disconnect outcomes.
- Establish whether playback records rendered snapshots or simulation events, and measure memory and rendering costs before building the feature.
- Scope local playback first; online playback must reflect the host's result without affecting the live simulation.

## Existing foundations

Visual opportunities and the first Meadow palette studies are documented in [the visual improvement backlog](visual-improvement-backlog.md).

- [PlayerInput](../src/engine/input/PlayerInput.ts): common action-source interface.
- [KeyboardManager](../src/engine/input/KeyboardManager.ts): current keyboard bindings and input state.
- [EngineWorkerProxy](../src/engine/worker/EngineWorkerProxy.ts): main-thread input forwarding to the simulation worker.
- [Game store](../src/store/gameStore.ts): match settings and current match results.
- [VictoryScreen](../src/components/VictoryScreen.tsx): rematch, arena selection, and match statistics.
- [HelpModal](../src/components/HelpModal.tsx): existing text-based instructions.
- [OnlineModal](../src/components/OnlineModal.tsx): room creation and joining interface.

Preserve the pure simulator boundary and existing loading budgets when implementing these ideas. Worker-sensitive changes must be verified in the default simulation-worker mode and with `?simWorker=off`.
