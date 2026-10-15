import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { toErrorBody, AppError, validationError } from './errors';
import { logEvent } from './audit';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiSuccess<T> {
  data: T;
  meta?: PageMeta | Record<string, unknown>;
}

export function ok<T>(data: T, meta?: PageMeta | Record<string, unknown>, init?: ResponseInit) {
  const body: ApiSuccess<T> = meta ? { data, meta } : { data };
  return NextResponse.json(body, { status: 200, ...init });
}

export function created<T>(data: T, meta?: Record<string, unknown>) {
  const body: ApiSuccess<T> = meta ? { data, meta } : { data };
  return NextResponse.json(body, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

/**
 * Central error translator. Zod issues become field-level validation details so
 * forms can highlight the offending input; everything unrecognised is logged
 * server-side and returned as an opaque 500.
 */
export function fail(error: unknown, context?: string) {
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      path: issue.path.join('.') || '_root',
      message: issue.message,
    }));
    const { status, body } = toErrorBody(
      validationError('Please correct the highlighted fields.', details),
    );
    return NextResponse.json(body, { status });
  }

  if (error instanceof AppError) {
    const { status, body } = toErrorBody(error);
    return NextResponse.json(body, { status });
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[api] unhandled error${context ? ` in ${context}` : ''}:`, error);
  void logEvent('api', `Unhandled error${context ? ` in ${context}` : ''}`, {
    level: 'ERROR',
    detail: { message },
  });

  const { status, body } = toErrorBody(error);
  return NextResponse.json(body, { status });
}

/** Wrap a route handler so thrown errors become well-formed responses. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
  context?: string,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return fail(error, context);
    }
  };
}

export function parseSearchParams(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

/** Read and JSON-parse a request body, rejecting malformed payloads early. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    throw validationError('The request body must be valid JSON.');
  }
}

export function buildPageMeta(
  total: number,
  page: number,
  pageSize: number,
): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

export function skipTake(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
