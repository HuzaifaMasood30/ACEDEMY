'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { ApiError, api, list, type QueryValue } from '@/lib/client-api';

/**
 * Data-loading hook for portal screens.
 *
 * Handles the four states every screen needs — loading, empty, error and ready —
 * plus debounced search, so no page has to reimplement them and none can
 * accidentally render a stale list without feedback.
 */

export interface UseResourceOptions {
  /** Re-fetch when these change. Compared shallowly by JSON. */
  params?: Record<string, QueryValue>;
  enabled?: boolean;
  /** Debounce applied to the whole param set, in milliseconds. */
  debounceMs?: number;
}

export interface ResourceState<T> {
  rows: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number } | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => void;
}

export function useResource<T>(
  path: string,
  options: UseResourceOptions = {},
): ResourceState<T> {
  const { params = {}, enabled = true, debounceMs = 0 } = options;
  const serialised = JSON.stringify(params);

  const [rows, setRows] = React.useState<T[]>([]);
  const [meta, setMeta] = React.useState<ResourceState<T>['meta']>(null);
  const [loading, setLoading] = React.useState(enabled);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  const loadedOnce = React.useRef(false);
  // Guards against a slow earlier response overwriting a newer one.
  const requestId = React.useRef(0);

  React.useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const id = ++requestId.current;
    const isFirstLoad = !loadedOnce.current;

    if (isFirstLoad) setLoading(true);
    else setRefreshing(true);

    const timer = window.setTimeout(async () => {
      try {
        const result = await list<T>(path, JSON.parse(serialised) as Record<string, QueryValue>);
        if (id !== requestId.current) return;

        setRows(result.rows);
        setMeta(
          result.meta
            ? {
                page: result.meta.page,
                pageSize: result.meta.pageSize,
                total: result.meta.total,
                totalPages: result.meta.totalPages,
              }
            : null,
        );
        setError(null);
        loadedOnce.current = true;
      } catch (caught) {
        if (id !== requestId.current) return;
        setError(
          caught instanceof ApiError ? caught.message : 'Something went wrong while loading data.',
        );
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [path, serialised, enabled, debounceMs, nonce]);

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);

  return { rows, meta, loading, refreshing, error, reload };
}

/**
 * Fetch an endpoint whose `data` is a single object rather than a collection
 * (dashboards, aggregates, settings). `useResource` intentionally collapses
 * non-array payloads to an empty list, so object endpoints need this instead.
 */
export interface ObjectResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useObjectResource<T>(
  path: string,
  options: UseResourceOptions = {},
): ObjectResourceState<T> {
  const { params = {}, enabled = true, debounceMs = 0 } = options;
  const serialised = JSON.stringify(params);

  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(enabled);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const requestId = React.useRef(0);

  React.useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const result = await api.getOne<T>(
          path,
          JSON.parse(serialised) as Record<string, QueryValue>,
        );
        if (id !== requestId.current) return;
        setData(result);
        setError(null);
      } catch (caught) {
        if (id !== requestId.current) return;
        setError(
          caught instanceof ApiError ? caught.message : 'Something went wrong while loading data.',
        );
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [path, serialised, enabled, debounceMs, nonce]);

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, reload };
}

/** Fire a mutating request and surface the outcome as a toast. */
export function useMutation() {
  const [pending, setPending] = React.useState(false);

  const run = React.useCallback(
    async <T,>(
      action: () => Promise<T>,
      options: {
        success?: string;
        /** Return a message to display instead of the thrown error's message. */
        onError?: (error: ApiError) => string | void;
      } = {},
    ): Promise<T | null> => {
      setPending(true);

      try {
        const result = await action();
        if (options.success) toast.success(options.success);
        return result;
      } catch (caught) {
        const error =
          caught instanceof ApiError
            ? caught
            : new ApiError('Something went wrong. Please try again.', 'UNKNOWN', 500);

        const override = options.onError?.(error);
        toast.error(override ?? error.message);
        return null;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  return { run, pending };
}

/** Debounce a rapidly-changing value, such as a search box. */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
