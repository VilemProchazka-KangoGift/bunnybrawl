import { useCallback, useEffect, useRef, useState } from 'react';

/** Show a value, auto-clearing after `ms`. A new flash cancels the prior
 *  timer. Unmount clears the pending timer. */
export function useTransientBanner<T>(): [T | null, (value: T | null, ms?: number) => void] {
  const [value, setValue] = useState<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((next: T | null, ms = 3000) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setValue(next);
    if (next !== null && ms > 0) {
      timerRef.current = setTimeout(() => {
        setValue(null);
        timerRef.current = null;
      }, ms);
    }
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return [value, flash];
}
