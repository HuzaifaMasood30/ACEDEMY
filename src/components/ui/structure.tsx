import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/format';
import { initials, stableColorIndex } from '@/lib/format';

/* --------------------------------------------------------------------------
   Card
   -------------------------------------------------------------------------- */

export function Card({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'card',
        interactive && 'card-interactive cursor-pointer',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
  icon,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3.5 sm:px-5',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand-soft-ink)] [&_svg]:size-4">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-[0.9375rem] font-semibold text-[var(--ink)]">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-4 sm:px-5', className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3 sm:px-5',
        className,
      )}
      {...props}
    />
  );
}

/* --------------------------------------------------------------------------
   Page header
   -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  className?: string;
}) {
  return (
    <header className={cn('space-y-3', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--ink-subtle)]">
            {breadcrumbs.map((crumb, i) => (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>/</span>}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="rounded transition-colors hover:text-[var(--ink)]"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-[var(--ink-muted)]">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--ink)] sm:text-2xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-3xl text-sm text-[var(--ink-muted)]">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/* --------------------------------------------------------------------------
   Empty & error states
   -------------------------------------------------------------------------- */

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--line-strong)] px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--ink-subtle)] [&_svg]:size-5">
          {icon}
        </span>
      )}
      <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
      {description && (
        <p className="mt-1 max-w-md text-xs leading-relaxed text-[var(--ink-muted)]">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Avatar
   -------------------------------------------------------------------------- */

const AVATAR_TONES = [
  'bg-[var(--chart-1)]',
  'bg-[var(--chart-2)]',
  'bg-[var(--chart-3)]',
  'bg-[var(--chart-4)]',
  'bg-[var(--chart-5)]',
  'bg-[var(--chart-6)]',
];

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const dimensions = {
    xs: 'size-6 text-[0.625rem]',
    sm: 'size-8 text-xs',
    md: 'size-10 text-sm',
    lg: 'size-12 text-base',
    xl: 'size-16 text-xl',
  }[size];

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        loading="lazy"
        className={cn(
          'shrink-0 rounded-full object-cover ring-2 ring-[var(--surface)]',
          dimensions,
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-[var(--surface)]',
        AVATAR_TONES[stableColorIndex(name)],
        dimensions,
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/* --------------------------------------------------------------------------
   Stat card — the primary number display on every dashboard
   -------------------------------------------------------------------------- */

export function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
  tone = 'brand',
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  trend?: { value: number; label?: string };
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
  href?: string;
  className?: string;
}) {
  const toneStyles: Record<string, string> = {
    brand: 'bg-[var(--brand-soft)] text-[var(--brand-soft-ink)]',
    success: 'bg-[var(--ok-soft)] text-[var(--ok-soft-ink)]',
    warning: 'bg-[var(--warn-soft)] text-[var(--warn-soft-ink)]',
    danger: 'bg-[var(--danger-soft)] text-[var(--danger-soft-ink)]',
    info: 'bg-[var(--info-soft)] text-[var(--info-soft-ink)]',
    accent: 'bg-[var(--accent-soft)] text-[var(--accent-soft-ink)]',
  };

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-[var(--ink-muted)] uppercase">
          {label}
        </p>
        {icon && (
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4.5',
              toneStyles[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>

      <p className="tabular mt-3 text-2xl leading-none font-semibold tracking-tight text-[var(--ink)]">
        {value}
      </p>

      <div className="mt-2 flex items-center gap-2">
        {trend && (
          <span
            className={cn(
              'tabular inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold',
              trend.value >= 0
                ? 'bg-[var(--ok-soft)] text-[var(--ok-soft-ink)]'
                : 'bg-[var(--danger-soft)] text-[var(--danger-soft-ink)]',
            )}
          >
            {trend.value >= 0 ? '▲' : '▼'} {Math.abs(trend.value).toFixed(1)}%
          </span>
        )}
        {hint && <span className="truncate text-xs text-[var(--ink-subtle)]">{hint}</span>}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn('card card-interactive block p-4 sm:p-5', className)}
      >
        {content}
      </Link>
    );
  }

  return <div className={cn('card p-4 sm:p-5', className)}>{content}</div>;
}

/* --------------------------------------------------------------------------
   Table
   -------------------------------------------------------------------------- */

export function TableWrap({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('scrollbar-slim w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

/**
 * Column visibility by breakpoint. A table that keeps every column on a phone
 * becomes unreadable, so callers mark the optional ones instead of duplicating
 * the markup per screen size.
 */
const HIDE_BELOW: Record<string, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

export function Th({
  className,
  children,
  align = 'left',
  hideBelow,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'right' | 'center';
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2.5 text-xs font-semibold tracking-wide text-[var(--ink-muted)] uppercase whitespace-nowrap',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        hideBelow && HIDE_BELOW[hideBelow],
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({
  className,
  align = 'left',
  hideBelow,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'right' | 'center';
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  return (
    <td
      className={cn(
        'border-b border-[var(--line)] px-3 py-2.5 align-middle text-[var(--ink)]',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        hideBelow && HIDE_BELOW[hideBelow],
        className,
      )}
      {...props}
    />
  );
}

export function Tr({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('transition-colors hover:bg-[var(--surface-hover)]', className)}
      {...props}
    />
  );
}

/* --------------------------------------------------------------------------
   Definition list for detail pages
   -------------------------------------------------------------------------- */

export function DetailList({
  items,
  columns = 2,
  className,
}: {
  items: { label: string; value: React.ReactNode; span?: boolean }[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  const cols = {
    1: 'sm:grid-cols-1',
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-3',
  }[columns];

  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-4', cols, className)}>
      {items.map((item) => (
        <div key={item.label} className={cn('min-w-0', item.span && 'sm:col-span-full')}>
          <dt className="text-xs font-medium tracking-wide text-[var(--ink-subtle)] uppercase">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm break-words text-[var(--ink)]">
            {item.value ?? '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* --------------------------------------------------------------------------
   Section heading inside a page
   -------------------------------------------------------------------------- */

export function SectionHeading({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-[var(--ink)]">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
