// Tiny pub/sub for module-scope local prefs (perfFlags, character selection, etc).
// Use with `useSyncExternalStore(emitter.subscribe, emitter.get)` from React.

export interface Emitter<T> {
  get(): T;
  set(next: T): void;
  subscribe(cb: () => void): () => void;
}

export function createEmitter<T>(initial: T): Emitter<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const cb of listeners) cb();
    },
    subscribe: (cb) => {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
  };
}
