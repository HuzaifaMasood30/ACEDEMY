'use client';

import { useState } from 'react';

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Accessible FAQ accordion.
 *
 * Uses native <details>/<summary> so it works without JavaScript, then
 * intercepts the toggle to keep the open/closed state in React for styling.
 * Each row animates its own grid row rather than a fixed max-height, so long
 * answers are never clipped.
 */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--surface)]">
      {items.map((item, index) => {
        const isOpen = open === index;
        return (
          <div key={item.question}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : index)}
              aria-expanded={isOpen}
              aria-controls={`faq-panel-${index}`}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)] sm:px-6 sm:py-5"
            >
              <span className="text-sm font-medium text-[var(--ink)] sm:text-base">
                {item.question}
              </span>
              <span
                aria-hidden
                className={[
                  'grid size-7 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-muted)] transition-transform duration-300',
                  isOpen ? 'rotate-45 border-[var(--brand)] text-[var(--brand)]' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <svg viewBox="0 0 24 24" fill="none" className="size-3.5">
                  <path
                    d="M12 5v14M5 12h14"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </button>

            <div
              id={`faq-panel-${index}`}
              role="region"
              hidden={!isOpen}
              className="px-5 pb-5 text-sm leading-relaxed text-[var(--ink-muted)] sm:px-6 sm:pb-6"
            >
              {item.answer}
            </div>
          </div>
        );
      })}
    </div>
  );
}
