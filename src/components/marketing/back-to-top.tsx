'use client';

import { useEffect, useState } from 'react';

/** Appears after the first screen and scrolls smoothly back to the top. */
export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        })
      }
      aria-label="Back to top"
      className={[
        'fixed bottom-6 left-6 z-40 grid size-11 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)] shadow-[var(--shadow-lg)] transition-all duration-300 hover:text-[var(--brand)]',
        show
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-3 opacity-0',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-4.5" aria-hidden>
        <path
          d="M12 19V5M5 12l7-7 7 7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
