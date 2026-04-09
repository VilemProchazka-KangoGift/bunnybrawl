# Component Caveats

- `CharacterSelect.tsx` has its own physics loop — separate from engine `physics.ts`. `LobbyPlayer` has `sideSquash` and `squashScale`, both decaying at rate 8.
- Canvas text in CharacterSelect needs i18n: `i18n.t('char_Name', name)`, not raw `char.name`.
- Screen containers must use `width/height: 100%` — they inherit from `GameScaler`'s 1280x720 div. Never set fixed pixel dimensions.
- Buttons use `.btn-base` from `shared.css` (hover scale 1.06, active 0.97). New buttons should include `btn-base`.
- Victory screen: two-column layout (scoreboard+stats left, stats+MVP right). "Change Arena" button opens overlay.
- Pause screen arena selector must update both `currentArenaId` local state AND `matchSettings.arenaId` in store.
- Menu music (`menuMusicHowl`) must NOT be tied to component lifecycle — neither MainMenu nor CharacterSelect stops on unmount. Preloaded in `audio.init()`.
- Gore mode persisted in `bunnybrawl_gore`, arena in `bunnybrawl_arena`, bots in `bunnybrawl_botcount`/`bunnybrawl_botdiff`.
- MainMenu modals (Mods, Help) use `mods-overlay` CSS class for the backdrop + `onClick` dismiss. Shared panel styles in `.mods-modal, .help-modal` rule — new modals add to that selector and only declare overrides.
- Down key = crouch (ground) / super stomp (air). Players never fall through platforms. Don't describe Down as "drop through" in any text.
- Lobby join zones are labeled "START", not "Join".
- Online lobby char-select onChange uses shared `handleOnlineCharChange` callback — don't duplicate the handler inline.
- In transport callbacks (`onPeerConnected`, `onReliableMessage`, etc.) snapshot `useGameStore.getState()` once and reuse. Multiple reads + interleaved `setOnline` calls cause redundant React re-renders.
- Mobile lobby: only P1 spawned (not P2-P5). `drawLobby` must iterate `players.length`, NOT the `SLOTS` array — accessing `players[i]` beyond array bounds crashes the canvas loop.
- Mobile overlay buttons (`.mobile-overlay-btn` in shared.css) are distinct from `.btn-base` — 44x44 translucent touch targets, no hover effects.
- TouchOverlay uses direct DOM refs (not React state) for joystick position — touch events fire at 60-120Hz, too fast for React reconciliation.
- Mobile pause/back buttons must NOT be intercepted by TouchInputManager — `handleTouchStart` skips `preventDefault` when target is a `<button>`.
