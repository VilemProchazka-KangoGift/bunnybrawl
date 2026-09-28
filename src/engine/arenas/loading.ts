import { registerArena } from './registry';

let builtinLoad: Promise<void> | undefined;
let lobbyLoad: Promise<void> | undefined;

/** Also used for lobby prefetch; a failed prefetch can be retried at match start. */
export function loadBuiltinArenas(): Promise<void> {
  builtinLoad ??= import('./builtin').then(({ registerBuiltinArenas }) => {
    registerBuiltinArenas();
  }).catch((error: unknown) => {
    builtinLoad = undefined;
    throw error;
  });
  return builtinLoad;
}

export function loadLobbyArena(): Promise<void> {
  lobbyLoad ??= import('./packs/lobby').then(({ lobby }) => {
    registerArena(lobby);
  }).catch((error: unknown) => {
    lobbyLoad = undefined;
    throw error;
  });
  return lobbyLoad;
}
