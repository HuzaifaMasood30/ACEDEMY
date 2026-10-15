/**
 * Typed application errors.
 *
 * Anything thrown as an AppError is safe to surface to the client: the message
 * is written for a user and carries no internal detail. Everything else is
 * converted to a generic 500 so stack traces and SQL never reach the browser.
 */
export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'DEPENDENCY_FAILED'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  DEPENDENCY_FAILED: 502,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  /** Set when the caller may retry the same request unchanged. */
  readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: unknown; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = options.details;
    this.retryable = options.retryable ?? false;
  }
}

export const unauthenticated = (message = 'You must sign in to continue.') =>
  new AppError('UNAUTHENTICATED', message);

export const forbidden = (message = 'You do not have permission to do that.') =>
  new AppError('FORBIDDEN', message);

export const notFound = (message = 'The requested record was not found.') =>
  new AppError('NOT_FOUND', message);

export const validationError = (message: string, details?: unknown) =>
  new AppError('VALIDATION', message, { details });

export const conflict = (message: string, details?: unknown) =>
  new AppError('CONFLICT', message, { details });

export const rateLimited = (message = 'Too many requests. Please slow down.') =>
  new AppError('RATE_LIMITED', message, { retryable: true });

export const dependencyFailed = (message: string, details?: unknown) =>
  new AppError('DEPENDENCY_FAILED', message, { details, retryable: true });

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

/** Convert any thrown value into a safe, serialisable API error body. */
export function toErrorBody(error: unknown): { status: number; body: ApiErrorBody } {
  if (isAppError(error)) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL',
        message: 'Something went wrong on our side. Please try again.',
      },
    },
  };
}
