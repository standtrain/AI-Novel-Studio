import { useEffect, useRef, useState } from 'react';

interface UseCountUpOptions {
  duration?: number;
  start?: number;
  enabled?: boolean;
  formatter?: (val: number) => string;
}

function useCountUp(end: number, options: UseCountUpOptions = {}) {
  const { duration = 2000, start = 0, enabled = false, formatter } = options;
  const [current, setCurrent] = useState(start);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;
    const range = end - start;
    startTimeRef.current = 0;

    const animate = (now: number) => {
      if (!startTimeRef.current) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = start + range * eased;
      setCurrent(value);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [end, start, duration, enabled]);

  return formatter ? formatter(current) : current;
}

export default useCountUp;
