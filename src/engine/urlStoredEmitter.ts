// src/engine/urlStoredEmitter.ts
//
// Factory for the URL+localStorage+emitter pattern shared by lighting,
// brightness, perfTier, photosensitivity, and dev-only flags (simWorker,
// inputEcho, turn, sabDemo, net-sim trio). URL param wins over storage.
// `parse` returns null when its input doesn't represent a valid value, so the
// caller can fall through to the next priority source.

import { safeStorage } from '../storage';
import { createEmitter } from './emitter';

export interface UrlStoredEmitterOptions<T> {
  /** localStorage key. */
  storageKey: string;
  /** URL search-param name. */
  paramName: string;
  /** Default value when neither URL nor storage provide one. */
  defaultValue: T;
  /** Parse a raw URL/storage string into T, or null if invalid. Doubles as
   *  validator for `set(v)` via the round-trip `parse(serialize(v))` —
   *  out-of-range/invalid inputs are coerced to the default. Must be tolerant
   *  of any string `serialize` can produce. */
  parse: (raw: string) => T | null;
  /** Serialize for storage AND for the round-trip `set` validator. Required —
   *  `String(true)` returns `'true'` which most `parse` functions reject,
   *  silently corrupting state on the next page load. */
  serialize: (value: T) => string;
  /** Optional legacy bare-flag alias: if URL contains `?<legacyDisableParam>`
   *  (with no value), force the emitter to `false`. Only meaningful for
   *  `T = boolean`. Replaces the old `?noecho`/`?noturn`/`?sabDemo` shapes
   *  without each caller redoing window/URLSearchParams plumbing. */
  legacyDisableParam?: string;
}

/** Shared parser+serializer pair for on/off URL flags. Reused by 5+ flag
 *  modules (`?lighting`, `?photosensitivity`, `?inputEcho`, `?turn`, …). */
export const BOOL_ON_OFF: {
  parse: (raw: string) => boolean | null;
  serialize: (v: boolean) => string;
} = {
  parse: (raw) => raw === 'on' || raw === '1' ? true
                : raw === 'off' || raw === '0' ? false
                : null,
  serialize: (v) => v ? 'on' : 'off',
};

export interface UrlStoredEmitter<T> {
  /** Read current value. */
  get: () => T;
  /** Subscribe to changes (for useSyncExternalStore). */
  subscribe: (listener: () => void) => () => void;
  /** Set + persist. Skips storage when value is unchanged. */
  set: (value: T) => void;
  /** Parse URL + storage on boot; URL > storage > default. */
  init: (searchString: string) => void;
}

export function createUrlStoredEmitter<T>(opts: UrlStoredEmitterOptions<T>): UrlStoredEmitter<T> {
  const { storageKey, paramName, defaultValue, parse, serialize, legacyDisableParam } = opts;
  const value = createEmitter<T>(defaultValue);
  /** Round-trip via serialize/parse so callers' invalid inputs (out-of-range
   *  numbers, garbage strings) end up as the default rather than corrupting
   *  the emitter. Brightness uses this to clamp [0.5, 1.5] inside parse. */
  function normalize(v: T): T {
    const parsed = parse(serialize(v));
    return parsed !== null ? parsed : defaultValue;
  }
  /** Set without firing subscribers when the value matches the default —
   *  used by `init` to avoid a phantom event on every page load when the
   *  URL/storage seed equals the constructor default. */
  function setSilentIfDefault(v: T): void {
    if (Object.is(v, defaultValue) && Object.is(value.get(), defaultValue)) return;
    value.set(v);
  }
  return {
    get: value.get,
    subscribe: value.subscribe,
    set(v: T): void {
      const normalized = normalize(v);
      const prev = value.get();
      value.set(normalized);
      // Skip the localStorage write when the new value matches the prior
      // one — set() lands on the synchronous DOM write path and DevMenu
      // toggles can fire many times during a single user click.
      if (!Object.is(prev, normalized)) safeStorage.set(storageKey, serialize(normalized));
    },
    init(searchString: string): void {
      const params = new URLSearchParams(searchString);
      const urlRaw = params.get(paramName);
      if (urlRaw !== null) {
        // URL is the user's explicit override. Use the parsed value if valid;
        // otherwise default. NEVER fall through to storage when the user
        // supplied a URL param — a typo shouldn't silently inherit prior state.
        setSilentIfDefault(parse(urlRaw) ?? defaultValue);
      } else {
        const stored = safeStorage.get(storageKey);
        const parsed = stored !== null ? parse(stored) : null;
        setSilentIfDefault(parsed !== null ? parsed : defaultValue);
      }
      // Legacy bare-flag alias: e.g. `?noecho` forces off. Applied after
      // the primary URL/storage resolution so the flag wins regardless of
      // what they said. Boolean-only by construction; the cast is the
      // narrowest workaround for the generic `T` signature.
      if (legacyDisableParam && params.has(legacyDisableParam)) {
        setSilentIfDefault(false as unknown as T);
      }
    },
  };
}
