// Dev-only debug flags — read from URL params once on import

const params = new URLSearchParams(window.location.search);
const debugParam = params.get('debug') ?? '';

export const debugFlags = {
  /** Whether nav debug was requested via URL (gates keyboard toggle) */
  navDebugAllowed: debugParam.includes('nav'),
  /** Whether nav debug overlay is currently visible */
  navDebugEnabled: debugParam.includes('nav'),
  /** Whether net debug was requested via URL (gates keyboard toggle) */
  netDebugAllowed: debugParam.includes('net'),
  /** Whether net debug overlay is currently visible */
  netDebugEnabled: debugParam.includes('net'),
};

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
