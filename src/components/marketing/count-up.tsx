'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Counts up to `value` the first time it scrolls into view.
 *
 * Renders the final value immediately on the server so the number is present
 * without JavaScript and is never wrong for assistive technology.
 */
export function CountUp({
  value,
  suffix = '',
  durationMs = 1400,
  className = '',
}: {
  value: number;
  suffix?: string;
  durationMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduceMotion =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion || typeof IntersectionObserver === 'undefined') {
      setDisplay(value);
      return;
    }

    let frame = 0;
    let start = 0;

    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / durationMs, 1);
      // Ease-out cubic keeps the final digits from crawling.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setDisplay(0);
            frame = requestAnimationFrame(step);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}
