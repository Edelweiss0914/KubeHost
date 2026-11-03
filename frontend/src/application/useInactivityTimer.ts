import { useCallback, useEffect, useRef, useState } from 'react';

const TIMEOUT_MS = 10 * 60 * 1000; // 10분

/** 사용자 비활동 타이머. enabled=true일 때만 동작. */
export function useInactivityTimer(onExpire: () => void, enabled: boolean): number {
  const [remaining, setRemaining] = useState(TIMEOUT_MS);
  const lastActivityRef = useRef(Date.now());
  const firedRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    firedRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setRemaining(TIMEOUT_MS);
      return;
    }

    lastActivityRef.current = Date.now();
    firedRef.current = false;

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;
    events.forEach(e => window.addEventListener(e, resetActivity, { passive: true }));

    const interval = window.setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const rem = Math.max(0, TIMEOUT_MS - elapsed);
      setRemaining(rem);
      if (rem === 0 && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current();
      }
    }, 1000);

    return () => {
      events.forEach(e => window.removeEventListener(e, resetActivity));
      clearInterval(interval);
    };
  }, [enabled, resetActivity]);

  return remaining;
}

export function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
