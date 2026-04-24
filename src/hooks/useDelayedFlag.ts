import { useEffect, useState } from 'react';

/** Returns `true` after `active` has been continuously `true` for `ms`.
 *  Used for UI elements (e.g. a Cancel button) that should only appear
 *  after a delay to avoid flicker on fast state transitions. */
export function useDelayedFlag(active: boolean, ms: number): boolean {
  const [flag, setFlag] = useState(false);
  useEffect(() => {
    if (!active) { setFlag(false); return; }
    const id = setTimeout(() => setFlag(true), ms);
    return () => clearTimeout(id);
  }, [active, ms]);
  return flag;
}
