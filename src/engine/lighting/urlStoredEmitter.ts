// src/engine/lighting/urlStoredEmitter.ts
//
// Factory for the URL+localStorage+emitter pattern shared by lighting,
// brightness, perfTier, and photosensitivity. URL param wins over storage.
// `parse` returns null when its input doesn't represent a valid value, so the
// caller can fall through to the next priority source.

import { safeStorage } from '../../storage';
import { createEmitter } from '../emitter';

export interface UrlStoredEmitterOptions<T> {
  /** localStorage key. */
  storageKey: string;
  /** URL search-param name. */
  paramName: string;
  /** Default value when neither URL nor storage provide one. */
  defaultValue: T;
  /** Parse a raw URL/storage string into T, or null if invalid. */
  parse: (raw: string) => T | null;
  /** Serialize for storage. Defaults to `String(value)`. */
  serialize?: (value: T) => string;
}

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
  const { storageKey, paramName, defaultValue, parse } = opts;
  const serialize = opts.serialize ?? ((v: T) => String(v));
  const value = createEmitter<T>(defaultValue);
  /** Round-trip via serialize/parse so callers' invalid inputs (out-of-range
   *  numbers, garbage strings) end up as the default rather than corrupting
   *  the emitter. Brightness uses this to clamp [0.5, 1.5] inside parse. */
  function normalize(v: T): T {
    const parsed = parse(serialize(v));
    return parsed !== null ? parsed : defaultValue;
  }
  return {
    get: value.get,
    subscribe: value.subscribe,
    set(v: T): void {
      const normalized = normalize(v);
      value.set(normalized);
      safeStorage.set(storageKey, serialize(normalized));
    },
    init(searchString: string): void {
      const params = new URLSearchParams(searchString);
      const urlRaw = params.get(paramName);
      if (urlRaw !== null) {
        // URL is the user's explicit override. Use the parsed value if valid;
        // otherwise default. NEVER fall through to storage when the user
        // supplied a URL param — a typo shouldn't silently inherit prior state.
        value.set(parse(urlRaw) ?? defaultValue);
        return;
      }
      const stored = safeStorage.get(storageKey);
      if (stored !== null) {
        const parsed = parse(stored);
        if (parsed !== null) { value.set(parsed); return; }
      }
      value.set(defaultValue);
    },
  };
}
