/**
 * Client-safe error copy.
 *
 * Kept separate from `@/auth` so the login form does not pull the server-only
 * Prisma and bcrypt modules into the browser bundle.
 */
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_LOCKED:
    'This account is temporarily locked after too many failed attempts. Try again later or contact the academy office.',
  ACCOUNT_SUSPENDED:
    'This account has been suspended. Please contact the academy administration.',
  ACCOUNT_DEACTIVATED:
    'This account has been deactivated. Please contact the academy administration.',
  PROFILE_INACTIVE:
    'Your staff profile is inactive. Please contact the academy administration.',
  CredentialsSignin: 'Incorrect email or password.',
  SessionRequired: 'Please sign in to continue.',
  default: 'Sign-in failed. Please check your details and try again.',
};

export function authErrorMessage(code?: string | null): string {
  if (!code) return AUTH_ERROR_MESSAGES.default;
  return AUTH_ERROR_MESSAGES[code] ?? AUTH_ERROR_MESSAGES.default;
}
