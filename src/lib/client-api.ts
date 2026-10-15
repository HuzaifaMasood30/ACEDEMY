'use client';

/**
 * Browser-side API client.
 *
 * Every portal screen reads and writes through this module so error handling,
 * credential inclusion and query serialisation behave the same everywhere.
 */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Array<{ path: string; message: string }> | Record<string, unknown>;
  };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Array<{ path: string; message: string }> | Record<string, unknown>;

  constructor(message: string, code: string, status: number, details?: ApiErrorBody['error']['details']) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** Field-level messages keyed by input name, for form error display. */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    const map: Record<string, string> = {};
    for (const issue of this.details) {
      if (issue.path && !map[issue.path]) map[issue.path] = issue.message;
    }
    return map;
  }
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  [key: string]: unknown;
}

export interface ListResult<T> {
  rows: T[];
  meta: PageMeta | null;
}

export type QueryValue = string | number | boolean | null | undefined;

export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      method,
      headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    // A network-level failure is distinct from a rejected request; the message
    // says so rather than pretending the server refused it.
    throw new ApiError(
      'Could not reach the server. Check your connection and try again.',
      'NETWORK',
      0,
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let parsed: unknown = null;

  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const body = parsed as ApiErrorBody | null;
    throw new ApiError(
      body?.error?.message ?? `The request failed (HTTP ${response.status}).`,
      body?.error?.code ?? 'UNKNOWN',
      response.status,
      body?.error?.details,
    );
  }

  const body = parsed as { data?: T } | null;
  return (body?.data ?? (parsed as T)) as T;
}

export interface Envelope<T> {
  data: T;
  meta?: PageMeta | null;
}

async function requestEnvelope<T>(
  path: string,
): Promise<Envelope<T>> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
  });

  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as { data: T; meta?: PageMeta }) : { data: undefined as T };

  if (!response.ok) {
    const body = parsed as unknown as ApiErrorBody;
    throw new ApiError(
      body?.error?.message ?? `The request failed (HTTP ${response.status}).`,
      body?.error?.code ?? 'UNKNOWN',
      response.status,
      body?.error?.details,
    );
  }

  return { data: parsed.data, meta: parsed.meta ?? null };
}

export const api = {
  get: <T>(path: string, params: Record<string, QueryValue> = {}) =>
    requestEnvelope<T>(`${path}${buildQuery(params)}`),

  /** GET that returns the raw `data` value, ignoring pagination metadata. */
  getOne: <T>(path: string, params: Record<string, QueryValue> = {}) =>
    request<T>('GET', `${path}${buildQuery(params)}`),

  /** URL for a download link (CSV exports), including the query string. */
  exportUrl: (path: string, params: Record<string, QueryValue> = {}) =>
    `${path}${buildQuery(params)}`,

  post: <T>(path: string, payload: unknown) => request<T>('POST', path, payload),
  put: <T>(path: string, payload: unknown) => request<T>('PUT', path, payload),
  patch: <T>(path: string, payload: unknown) => request<T>('PATCH', path, payload),
  del: <T>(path: string, payload?: unknown) => request<T>('DELETE', path, payload),
};

/** Read a page of a list endpoint into rows plus metadata. */
export async function list<T>(
  path: string,
  params: Record<string, QueryValue> = {},
): Promise<ListResult<T>> {
  const { data, meta } = await api.get<T[]>(path, params);
  return { rows: Array.isArray(data) ? data : [], meta: meta ?? null };
}
