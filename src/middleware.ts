import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { env } from '@/lib/env';

/**
 * Edge middleware handles coarse routing only: is the caller signed in, and
 * does the portal prefix match their role? Fine-grained authorization always
 * re-runs on the server in the route/page itself, because middleware cannot be
 * the only gate for a data read.
 */

const ROLE_PREFIX: Record<string, string> = {
  ADMIN: '/admin',
  TEACHER: '/teacher',
  STUDENT: '/student',
  PARENT: '/parent',
};

const PORTAL_PREFIXES = ['/admin', '/teacher', '/student', '/parent'];

/**
 * Resolve the session cookie name from the request.
 *
 * `getToken` defaults `cookieName` to the non-secure `authjs.session-token`
 * unless `secureCookie` is passed, so in a production build it never finds the
 * `__Secure-`-prefixed cookie that the Node runtime issued and returns null.
 * Reading the name off the request keeps both names working in either mode.
 */
function sessionCookieName(request: NextRequest): string {
  return request.cookies.has('__Secure-authjs.session-token')
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token';
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const cookieName = sessionCookieName(request);

  const token = await getToken({
    req: request,
    secret: env.AUTH_SECRET,
    cookieName,
    salt: cookieName,
  });

  const isPortal = PORTAL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isPortal) {
    if (!token?.uid) {
      const url = new URL('/login', request.url);
      url.searchParams.set('next', `${pathname}${search}`);
      return NextResponse.redirect(url);
    }

    const home = ROLE_PREFIX[token.role as string];
    const matchesRole = home && (pathname === home || pathname.startsWith(`${home}/`));

    if (!matchesRole) {
      // A signed-in user hitting another portal is sent to their own home
      // rather than shown a 403, which avoids leaking which portals exist.
      return NextResponse.redirect(new URL(home ?? '/', request.url));
    }
  }

  // /login is deliberately reachable while signed in. The page offers the
  // visitor a choice (continue to their portal, or sign in as someone else).
  // Redirecting here made the sign-in form unreachable, so every other
  // account looked broken and there was no way to switch user.

  const response = NextResponse.next();

  // Baseline hardening for every response.
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');

  return response;
}

export const config = {
  matcher: [
    /*
     * Skip static assets and the auth endpoints so the middleware stays cheap.
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|images/).*)',
  ],
};
