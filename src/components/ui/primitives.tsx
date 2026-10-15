import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/format';

/* --------------------------------------------------------------------------
   Button
   -------------------------------------------------------------------------- */

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ' +
    'transition-[background-color,border-color,box-shadow,transform,color] duration-150 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] ' +
    'disabled:pointer-events-none disabled:opacity-50 active:translate-y-px ' +
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--brand)] text-[var(--ink-inverse)] shadow-[var(--shadow-sm)] hover:bg-[var(--brand-hover)]',
        secondary:
          'bg-[var(--surface)] text-[var(--ink)] border border-[var(--line-strong)] shadow-[var(--shadow-xs)] hover:bg-[var(--surface-hover)]',
        outline:
          'border border-[var(--line-strong)] bg-transparent text-[var(--ink)] hover:bg-[var(--surface-hover)]',
        ghost:
          'bg-transparent text-[var(--ink-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]',
        soft: 'bg-[var(--brand-soft)] text-[var(--brand-soft-ink)] hover:brightness-[0.97]',
        danger:
          'bg-[var(--danger)] text-white shadow-[var(--shadow-sm)] hover:bg-[var(--danger-hover)]',
        dangerSoft:
          'bg-[var(--danger-soft)] text-[var(--danger-soft-ink)] hover:brightness-[0.97]',
        success:
          'bg-[var(--ok)] text-white shadow-[var(--shadow-sm)] hover:brightness-[0.95]',
        link: 'bg-transparent text-[var(--brand)] underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        sm: 'h-8 px-3 text-xs [&_svg]:size-3.5',
        md: 'h-9.5 px-4 [&_svg]:size-4',
        lg: 'h-11 px-5 text-[0.9375rem] [&_svg]:size-4.5',
        icon: 'size-9.5 [&_svg]:size-4',
        iconSm: 'size-8 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

/* --------------------------------------------------------------------------
   Badge
   -------------------------------------------------------------------------- */

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5 whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-muted)]',
        brand: 'border-transparent bg-[var(--brand-soft)] text-[var(--brand-soft-ink)]',
        success: 'border-transparent bg-[var(--ok-soft)] text-[var(--ok-soft-ink)]',
        warning: 'border-transparent bg-[var(--warn-soft)] text-[var(--warn-soft-ink)]',
        danger: 'border-transparent bg-[var(--danger-soft)] text-[var(--danger-soft-ink)]',
        info: 'border-transparent bg-[var(--info-soft)] text-[var(--info-soft-ink)]',
        accent: 'border-transparent bg-[var(--accent-soft)] text-[var(--accent-soft-ink)]',
        outline: 'border-[var(--line-strong)] bg-transparent text-[var(--ink-muted)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/* --------------------------------------------------------------------------
   Form controls
   -------------------------------------------------------------------------- */

const fieldBase =
  'w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] ' +
  'placeholder:text-[var(--ink-subtle)] transition-[border-color,box-shadow] duration-150 ' +
  'focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-ring)] ' +
  'disabled:cursor-not-allowed disabled:bg-[var(--surface-sunken)] disabled:opacity-70 ' +
  'aria-[invalid=true]:border-[var(--danger)] aria-[invalid=true]:ring-[var(--danger-soft)]';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, 'h-9.5', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldBase, 'min-h-24 py-2 leading-relaxed', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      fieldBase,
      'h-9.5 cursor-pointer appearance-none bg-[length:1rem] bg-[right_0.625rem_center] bg-no-repeat pr-9',
      className,
    )}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
    }}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export function Label({
  className,
  required,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label
      className={cn('block text-sm font-medium text-[var(--ink)]', className)}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-0.5 text-[var(--danger)]" aria-hidden>
          *
        </span>
      )}
    </label>
  );
}

export interface FieldProps {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

/** Label + control + hint/error. `aria-describedby` keeps the message attached. */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  children,
}: FieldProps) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      <div data-describedby={describedBy}>{children}</div>
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-xs text-[var(--ink-subtle)]">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="text-xs font-medium text-[var(--danger)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      'size-4 shrink-0 cursor-pointer rounded border-[var(--line-strong)] accent-[var(--brand)] ' +
        'focus-visible:outline-2 focus-visible:outline-offset-2 ' +
        'focus-visible:outline-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Checkbox.displayName = 'Checkbox';

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors duration-200',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-[var(--brand)]' : 'bg-[var(--line-strong)]',
      )}
    >
      <span
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-1',
        )}
      />
    </button>
  );
}

/* --------------------------------------------------------------------------
   Alert
   -------------------------------------------------------------------------- */

const alertVariants = cva('flex gap-3 rounded-lg border p-3.5 text-sm', {
  variants: {
    tone: {
      info: 'border-[var(--info)]/25 bg-[var(--info-soft)] text-[var(--info-soft-ink)]',
      success: 'border-[var(--ok)]/25 bg-[var(--ok-soft)] text-[var(--ok-soft-ink)]',
      warning: 'border-[var(--warn)]/30 bg-[var(--warn-soft)] text-[var(--warn-soft-ink)]',
      danger: 'border-[var(--danger)]/25 bg-[var(--danger-soft)] text-[var(--danger-soft-ink)]',
      neutral: 'border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-muted)]',
    },
  },
  defaultVariants: { tone: 'info' },
});

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string;
  icon?: React.ReactNode;
}

export function Alert({ className, tone, title, icon, children, ...props }: AlertProps) {
  return (
    <div role="alert" className={cn(alertVariants({ tone }), className)} {...props}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-[0.8125rem] leading-relaxed opacity-90">{children}</div>}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Progress
   -------------------------------------------------------------------------- */

export function Progress({
  value,
  max = 100,
  tone = 'brand',
  size = 'md',
  showLabel = false,
  className,
  label,
}: {
  value: number;
  max?: number;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  const toneVar: Record<string, string> = {
    brand: 'var(--brand)',
    success: 'var(--ok)',
    warning: 'var(--warn)',
    danger: 'var(--danger)',
    accent: 'var(--accent)',
  };

  const height = size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-2.5' : 'h-2';

  return (
    <div className={cn('space-y-1', className)}>
      {(showLabel || label) && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--ink-muted)]">{label}</span>
          {showLabel && (
            <span className="tabular font-medium text-[var(--ink)]">{pct.toFixed(1)}%</span>
          )}
        </div>
      )}
      <div
        className={cn('w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]', height)}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: toneVar[tone] }}
        />
      </div>
    </div>
  );
}
