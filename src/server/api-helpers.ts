import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { ZodType } from 'zod';
import { fail, ok, readJson, buildPageMeta } from '@/lib/api';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { rateLimited } from '@/lib/errors';
import { pagination } from '@/lib/validation';
import { requireActor, requirePermission, type Actor } from '@/server/auth-guard';
import type { Permission } from '@/lib/rbac';

/**
 * Route helpers shared by every portal API.
 *
 * They keep the authorisation check, rate limiting and error translation in one
 * place so an endpoint cannot accidentally skip one of them.
 */

export interface ListQuery {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  search: string;
  params: URLSearchParams;
}

/** Parse pagination and search from the query string, clamped to sane limits. */
export function parseListQuery(request: Request): ListQuery {
  const params = new URL(request.url).searchParams;

  const { page, pageSize } = pagination.parse({
    page: params.get('page') ?? undefined,
    pageSize: params.get('pageSize') ?? undefined,
  });

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    search: (params.get('q') ?? '').trim(),
    params,
  };
}

export function listResponse<T>(rows: T[], total: number, query: ListQuery) {
  return ok(rows, buildPageMeta(total, query.page, query.pageSize));
}

/**
 * Require one of the given permissions and return the actor.
 * Throws (rather than returning a response) so handlers stay linear.
 */
export async function guard(...permissions: Permission[]): Promise<Actor> {
  if (permissions.length === 0) return requireActor();
  return requirePermission(...permissions);
}

/**
 * Apply a fixed-window rate limit to a sensitive endpoint.
 * `key` should identify the action, not the user alone, so limits are per
 * action and cannot be pooled across endpoints.
 */
export async function limit(
  request: Request,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<void> {
  const result = await checkRateLimit(`${key}:${clientIp(request)}`, max, windowSeconds);
  if (!result.allowed) throw rateLimited();
}

/** Parse a JSON body against a schema, converting Zod issues into a 422. */
export async function body<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const raw = await readJson(request);
  return schema.parse(raw);
}

export { fail, ok, NextResponse, ZodError };
