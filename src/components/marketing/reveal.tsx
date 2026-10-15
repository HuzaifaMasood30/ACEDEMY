'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Reveals children when they scroll into view.
 *
 * Uses IntersectionObserver so the effect is one-shot and cheap. The CSS
 * `.reveal` class starts elements hidden; this only adds `is-visible`. When
 * motion is reduced the stylesheet forces the visible state, so the content is
 * never trapped behind an animation that will not run.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  /** 1-6 maps to a staggered transition delay. */
  delay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Without IntersectionObserver, show the content immediately.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={[
        'reveal',
        visible ? 'is-visible' : '',
        delay > 0 ? `reveal-delay-${delay}` : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
