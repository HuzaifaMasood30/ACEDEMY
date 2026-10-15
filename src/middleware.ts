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

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const token = await getToken({
    req: request,
    secret: env.AUTH_SECRET,
    salt:
      env.NODE_ENV === 'production'
        ? '__Secure-authjs.session-token'
        : 'authjs.session-token',
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

  if (pathname === '/login' && token?.uid) {
    const home = ROLE_PREFIX[token.role as string];
    if (home) return NextResponse.redirect(new URL(home, request.url));
  }

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
