// Dev-only debug flags — read from URL params once on import

const params = new URLSearchParams(window.location.search);
const debugParam = params.get('debug') ?? '';

export const debugFlags = {
  /** Whether nav debug was requested via URL (gates keyboard toggle) */
  navDebugAllowed: debugParam.includes('nav'),
  /** Whether nav debug overlay is currently visible */
  navDebugEnabled: debugParam.includes('nav'),
};

export function toggleNavDebug(): void {
  if (debugFlags.navDebugAllowed) {
    debugFlags.navDebugEnabled = !debugFlags.navDebugEnabled;
  }
}
