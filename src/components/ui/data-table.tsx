'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/format';
import { Button, Checkbox, Input, Select } from './primitives';
import { EmptyState } from './structure';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  /** Cell renderer. Receives the row and its index. */
  cell: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  className?: string;
  headerClassName?: string;
  /** Hide on narrow viewports; the primary column should never be hidden. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDef {
  key: string;
  label: string;
  options: FilterOption[];
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;

  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;

  searchable?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;

  filters?: FilterDef[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;

  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSortChange?: (key: string, dir: 'asc' | 'desc') => void;

  selectable?: boolean;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  bulkActions?: (selectedKeys: string[]) => React.ReactNode;

  /** Server-side pagination metadata. Omit for client-side tables. */
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  onPageChange?: (page: number) => void;

  toolbarExtra?: React.ReactNode;
  className?: string;
}

const HIDE_CLASS: Record<string, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyTitle = 'No records found',
  emptyDescription = 'There is nothing to display yet. Adjust your filters or add a new record.',
  emptyAction,
  searchable,
  searchPlaceholder = 'Search…',
  searchValue,
  onSearchChange,
  filters,
  filterValues = {},
  onFilterChange,
  sortKey,
  sortDir,
  onSortChange,
  selectable,
  selectedKeys = [],
  onSelectionChange,
  bulkActions,
  pagination,
  onPageChange,
  toolbarExtra,
  className,
}: DataTableProps<T>) {
  const selectedSet = React.useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const allSelected = rows.length > 0 && rows.every((r) => selectedSet.has(rowKey(r)));
  const someSelected = rows.some((r) => selectedSet.has(rowKey(r)));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      const visible = new Set(rows.map(rowKey));
      onSelectionChange(selectedKeys.filter((k) => !visible.has(k)));
    } else {
      onSelectionChange(Array.from(new Set([...selectedKeys, ...rows.map(rowKey)])));
    }
  };

  const toggleOne = (key: string) => {
    if (!onSelectionChange) return;
    onSelectionChange(
      selectedSet.has(key)
        ? selectedKeys.filter((k) => k !== key)
        : [...selectedKeys, key],
    );
  };

  const hasToolbar =
    searchable || (filters && filters.length > 0) || toolbarExtra || selectedKeys.length > 0;

  const activeFilterCount = Object.values(filterValues).filter(Boolean).length;

  return (
    <div className={cn('space-y-3', className)}>
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--ink-subtle)]"
                aria-hidden
              />
              <Input
                type="search"
                value={searchValue ?? ''}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="pl-9"
              />
            </div>
          )}

          {filters?.map((filter) => (
            <Select
              key={filter.key}
              value={filterValues[filter.key] ?? ''}
              onChange={(e) => onFilterChange?.(filter.key, e.target.value)}
              aria-label={filter.label}
              className="w-auto min-w-[9rem]"
            >
              <option value="">{filter.label}: All</option>
              {filter.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          ))}

          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                filters?.forEach((f) => onFilterChange?.(f.key, ''));
              }}
            >
              <X />
              Clear filters
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2">{toolbarExtra}</div>
        </div>
      )}

      {selectable && selectedKeys.length > 0 && (
        <div className="animate-rise flex flex-wrap items-center gap-3 rounded-lg border border-[var(--brand)]/25 bg-[var(--brand-soft)] px-3.5 py-2.5">
          <span className="text-sm font-medium text-[var(--brand-soft-ink)]">
            {selectedKeys.length} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions?.(selectedKeys)}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => onSelectionChange?.([])}
          >
            Clear
          </Button>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton columns={columns.length} />
        ) : rows.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
        ) : (
          <div className="scrollbar-slim w-full overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {selectable && (
                    <th className="w-10 border-b border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2.5">
                      <Checkbox
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected && !allSelected;
                        }}
                        onChange={toggleAll}
                        aria-label="Select all rows on this page"
                      />
                    </th>
                  )}
                  {columns.map((col) => {
                    const isSorted = sortKey === col.key;
                    return (
                      <th
                        key={col.key}
                        scope="col"
                        className={cn(
                          'border-b border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2.5 text-xs font-semibold tracking-wide whitespace-nowrap text-[var(--ink-muted)] uppercase',
                          col.align === 'right' && 'text-right',
                          col.align === 'center' && 'text-center',
                          col.align !== 'right' && col.align !== 'center' && 'text-left',
                          col.hideBelow && HIDE_CLASS[col.hideBelow],
                          col.headerClassName,
                        )}
                        aria-sort={
                          isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined
                        }
                      >
                        {col.sortable && onSortChange ? (
                          <button
                            type="button"
                            onClick={() =>
                              onSortChange(col.key, isSorted && sortDir === 'asc' ? 'desc' : 'asc')
                            }
                            className={cn(
                              'inline-flex items-center gap-1 rounded transition-colors hover:text-[var(--ink)]',
                              isSorted && 'text-[var(--brand)]',
                            )}
                          >
                            {col.header}
                            {isSorted ? (
                              sortDir === 'asc' ? (
                                <ArrowUp className="size-3.5" aria-hidden />
                              ) : (
                                <ArrowDown className="size-3.5" aria-hidden />
                              )
                            ) : (
                              <ChevronsUpDown className="size-3.5 opacity-40" aria-hidden />
                            )}
                          </button>
                        ) : (
                          col.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const key = rowKey(row);
                  const isSelected = selectedSet.has(key);
                  return (
                    <tr
                      key={key}
                      className={cn(
                        'border-b border-[var(--line)] transition-colors last:border-0',
                        isSelected
                          ? 'bg-[var(--brand-soft)]/45'
                          : 'hover:bg-[var(--surface-hover)]',
                      )}
                    >
                      {selectable && (
                        <td className="w-10 px-3 py-2.5">
                          <Checkbox
                            checked={isSelected}
                            onChange={() => toggleOne(key)}
                            aria-label={`Select row ${index + 1}`}
                          />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={cn(
                            'px-3 py-2.5 align-middle text-[var(--ink)]',
                            col.align === 'right' && 'text-right',
                            col.align === 'center' && 'text-center',
                            col.hideBelow && HIDE_CLASS[col.hideBelow],
                            col.className,
                          )}
                        >
                          {col.cell(row, index)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination && !loading && rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3">
            <p className="tabular text-xs text-[var(--ink-muted)]">
              Showing{' '}
              <span className="font-medium text-[var(--ink)]">
                {(pagination.page - 1) * pagination.pageSize + 1}–
                {Math.min(pagination.page * pagination.pageSize, pagination.total)}
              </span>{' '}
              of <span className="font-medium text-[var(--ink)]">{pagination.total}</span>
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => onPageChange?.(pagination.page - 1)}
              >
                Previous
              </Button>
              <span className="tabular px-2 text-xs text-[var(--ink-muted)]">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => onPageChange?.(pagination.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TableSkeleton({ columns }: { columns: number }) {
  return (
    <div className="space-y-px p-3">
      {Array.from({ length: 6 }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <div
              key={colIndex}
              className="skeleton h-7 flex-1"
              style={{ maxWidth: colIndex === 0 ? '22%' : undefined }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
