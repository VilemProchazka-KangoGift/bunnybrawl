// Dev-only debug flags — explicitly initialized via initDebugFlags(searchString).
// Defaults to all false so this module is safe to import in Node (no `window` access).
// In the browser, call initDebugFlags(window.location.search) once at app start.

export const debugFlags = {
  /** Whether nav debug was requested via URL (gates keyboard toggle) */
  navDebugAllowed: false,
  /** Whether nav debug overlay is currently visible */
  navDebugEnabled: false,
  /** Whether net debug was requested via URL (gates keyboard toggle) */
  netDebugAllowed: false,
  /** Whether net debug overlay is currently visible */
  netDebugEnabled: false,
  /** Whether fps overlay was requested via URL (gates keyboard toggle) */
  fpsAllowed: false,
  /** Whether fps overlay is currently visible */
  fpsEnabled: false,
  /** Whether perf instrumentation is collecting section timings (set via ?debug=perf, no keyboard toggle) */
  perfEnabled: false,
};

/** Parse ?debug=... URL params and populate debugFlags. Call once at app start in the browser. */
export function initDebugFlags(searchString: string): void {
  const params = new URLSearchParams(searchString);
  const debugParam = params.get('debug') ?? '';
  debugFlags.navDebugAllowed = debugParam.includes('nav');
  debugFlags.navDebugEnabled = debugParam.includes('nav');
  debugFlags.netDebugAllowed = debugParam.includes('net');
  debugFlags.netDebugEnabled = debugParam.includes('net');
  debugFlags.fpsAllowed = debugParam.includes('fps');
  debugFlags.fpsEnabled = debugParam.includes('fps');
  debugFlags.perfEnabled = debugParam.includes('perf');
}

export function toggleNavDebug(): void {
  if (debugFlags.navDebugAllowed) {
    debugFlags.navDebugEnabled = !debugFlags.navDebugEnabled;
  }
}

export function toggleNetDebug(): void {
  if (debugFlags.netDebugAllowed) {
    debugFlags.netDebugEnabled = !debugFlags.netDebugEnabled;
  }
}

export function toggleFpsDebug(): void {
  if (debugFlags.fpsAllowed) {
    debugFlags.fpsEnabled = !debugFlags.fpsEnabled;
  }
}

export type DebugFlagName = 'nav' | 'net' | 'fps' | 'perf';

/** Set a debug flag from the dev menu — bypasses URL gating by flipping *Allowed and *Enabled together. */
export function setDebugFlag(name: DebugFlagName, value: boolean): void {
  switch (name) {
    case 'nav':
      debugFlags.navDebugAllowed = value;
      debugFlags.navDebugEnabled = value;
      break;
    case 'net':
      debugFlags.netDebugAllowed = value;
      debugFlags.netDebugEnabled = value;
      break;
    case 'fps':
      debugFlags.fpsAllowed = value;
      debugFlags.fpsEnabled = value;
      break;
    case 'perf':
      debugFlags.perfEnabled = value;
      break;
  }
}

export function getDebugFlag(name: DebugFlagName): boolean {
  switch (name) {
    case 'nav': return debugFlags.navDebugEnabled;
    case 'net': return debugFlags.netDebugEnabled;
    case 'fps': return debugFlags.fpsEnabled;
    case 'perf': return debugFlags.perfEnabled;
  }
}
