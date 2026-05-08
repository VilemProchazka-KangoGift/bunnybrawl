import { useState } from 'react';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';

/**
 * Drives the loading-overlay state machine that originally lived inline in
 * `Match.tsx`.
 *
 * Two independent signals must clear before the overlay hides:
 *  - `phaseIsLoading`: gameplay phase is still 'loading' (host: GameLoop's
 *    setOnPhaseChange; guest: NetMatch.onPhaseChange).
 *  - `localTasksDone`: this client finished `runLoadingTasks` (music preload,
 *    background paint, sprite warmup).
 *
 * Either one being "not ready" keeps the overlay visible. This prevents the
 * guest from hiding the overlay the moment the host flips phase if the
 * guest's own asset preload hasn't finished yet.
 *
 * The hook owns no effects — it's a thin reducer over two booleans plus
 * `useDelayedFlag` for the cancel button. The lifecycle hooks (useLocalMatch,
 * useOnlineMatch) drive the setters.
 */
export interface LoadingOverlayState {
  phaseIsLoading: boolean;
  localTasksDone: boolean;
  /** True iff phaseIsLoading || !localTasksDone */
  showLoadingOverlay: boolean;
  /** Becomes true after the overlay has been visible continuously for 3s. */
  showLoadingCancel: boolean;
  setPhaseIsLoading: (b: boolean) => void;
  setLocalTasksDone: (b: boolean) => void;
}

export function useLoadingOverlay(): LoadingOverlayState {
  const [phaseIsLoading, setPhaseIsLoading] = useState(true);
  const [localTasksDone, setLocalTasksDone] = useState(false);
  const showLoadingOverlay = phaseIsLoading || !localTasksDone;
  // Cancel button only appears after a delay so brief loads don't flicker it.
  const showLoadingCancel = useDelayedFlag(showLoadingOverlay, 3000);
  return {
    phaseIsLoading,
    localTasksDone,
    showLoadingOverlay,
    showLoadingCancel,
    setPhaseIsLoading,
    setLocalTasksDone,
  };
}

/** Pure helper: pick the loading sub-text to render.
 *  - Online client done locally but waiting on host LOADED handshake → "Waiting for other players..."
 *  - Anything else → "Loading arena..." */
export function loadingSubKey(
  isOnline: boolean,
  localTasksDone: boolean,
  phaseIsLoading: boolean,
): 'loading_waiting_others' | 'loading_arena' {
  return isOnline && localTasksDone && phaseIsLoading
    ? 'loading_waiting_others'
    : 'loading_arena';
}
