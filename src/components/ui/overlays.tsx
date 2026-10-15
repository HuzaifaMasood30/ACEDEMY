'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/format';
import { Button } from './primitives';

/* --------------------------------------------------------------------------
   Modal — portal-rendered, focus-trapped, Escape-dismissable
   -------------------------------------------------------------------------- */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Set when closing would discard work; the backdrop then requires a click. */
  dismissOnBackdrop?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissOnBackdrop = true,
}: ModalProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog so screen readers announce it.
    const focusTimer = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type=hidden]), select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    }, 30);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const widths = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6">
      <div
        className="animate-fade fixed inset-0 bg-[var(--overlay)] backdrop-blur-[2px]"
        onClick={dismissOnBackdrop ? onClose : undefined}
        aria-hidden
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'animate-scale-in relative z-10 my-auto w-full rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]',
          widths,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-[var(--ink)]">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X />
          </Button>
        </div>

        <div className="scrollbar-slim max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] bg-[var(--surface-sunken)] px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* --------------------------------------------------------------------------
   Confirmation dialog for destructive or irreversible actions
   -------------------------------------------------------------------------- */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading,
  requireTypedConfirmation,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  /** For irreversible actions, require the user to type the confirm label. */
  requireTypedConfirmation?: boolean;
}) {
  const [typed, setTyped] = React.useState('');
  const [inputId] = React.useState(() => `confirm-${Math.random().toString(36).slice(2)}`);

  React.useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const blocked = requireTypedConfirmation && typed.trim() !== confirmLabel;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      dismissOnBackdrop={!loading}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            disabled={blocked}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger-soft-ink)]">
          <AlertTriangle className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-3 text-sm text-[var(--ink-muted)]">
          <div>{message}</div>
          {requireTypedConfirmation && (
            <div className="space-y-1.5">
              <label htmlFor={inputId} className="block text-xs font-medium text-[var(--ink)]">
                Type <span className="font-mono font-semibold">{confirmLabel}</span> to confirm
              </label>
              <input
                id={inputId}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                className="h-9.5 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)] focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   Drawer — side panel for filters and detail previews
   -------------------------------------------------------------------------- */

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  side = 'right',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  side?: 'left' | 'right';
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="animate-fade absolute inset-0 bg-[var(--overlay)]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'absolute top-0 bottom-0 flex w-full max-w-md flex-col border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]',
          side === 'right'
            ? 'animate-slide-in-right right-0 border-l'
            : 'animate-slide-in-right left-0 border-r',
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--ink)]">{title}</h2>
          <Button variant="ghost" size="iconSm" onClick={onClose} aria-label="Close panel">
            <X />
          </Button>
        </div>
        <div className="scrollbar-slim flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] bg-[var(--surface-sunken)] px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* --------------------------------------------------------------------------
   Tabs
   -------------------------------------------------------------------------- */

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: string; label: string; count?: number; icon?: React.ReactNode }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'scrollbar-slim flex gap-1 overflow-x-auto border-b border-[var(--line)]',
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative -mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              active
                ? 'border-[var(--brand)] text-[var(--brand)]'
                : 'border-transparent text-[var(--ink-muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]',
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'tabular rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold',
                  active
                    ? 'bg-[var(--brand-soft)] text-[var(--brand-soft-ink)]'
                    : 'bg-[var(--surface-sunken)] text-[var(--ink-subtle)]',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
