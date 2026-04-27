// localStorage throws in Safari private mode, sandboxed iframes, and
// cookies-disabled contexts.

export const safeStorage = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* restricted context */ }
  },
  remove(key: string): void {
    try { localStorage.removeItem(key); } catch { /* restricted context */ }
  },
};
