import { useCallback, useEffect, useRef, useState } from 'react';

/** Show a message, auto-clearing after `ms`. Clearing an active banner to
 *  show a new one cancels the previous timer. Unmount cleans up the timer. */
export function useTransientBanner(): [string | null, (msg: string | null, ms?: number) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string | null, ms = 3000) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setMessage(msg);
    if (msg !== null && ms > 0) {
      timerRef.current = setTimeout(() => {
        setMessage(null);
        timerRef.current = null;
      }, ms);
    }
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return [message, flash];
}
