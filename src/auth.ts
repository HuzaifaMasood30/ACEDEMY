import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyPassword, dummyPasswordCheck } from '@/lib/password';
import { effectivePermissions } from '@/lib/rbac';
import { env } from '@/lib/env';
import { logEvent } from '@/lib/audit';
import { Role, UserStatus } from '@prisma/client';

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/** How long an account stays locked after too many failed attempts. */
const LOCKOUT_MS = env.LOGIN_LOCKOUT_MINUTES * 60 * 1000;

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      status: UserStatus;
      campusId: string | null;
      locale: string;
      themePref: string;
      permissions: string[];
      teacherProfileId?: string | null;
      studentId?: string | null;
    };
    expires: string;
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: Role;
    status: UserStatus;
    campusId: string | null;
    locale: string;
    themePref: string;
    permissions: string[];
    teacherProfileId?: string | null;
    studentId?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid: string;
    role: Role;
    status: UserStatus;
    campusId: string | null;
    locale: string;
    themePref: string;
    permissions: string[];
    teacherProfileId?: string | null;
    studentId?: string | null;
    /** Epoch seconds of the last privilege refresh. */
    refreshedAt?: number;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: env.AUTH_TRUST_HOST,
  secret: env.AUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: env.SESSION_MAX_AGE,
    updateAge: 15 * 60,
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  cookies: {
    sessionToken: {
      name:
        env.NODE_ENV === 'production'
          ? '__Secure-authjs.session-token'
          : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: env.NODE_ENV === 'production',
      },
    },
  },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            teacherProfile: { select: { id: true, isActive: true } },
            studentProfile: { select: { id: true, status: true } },
            permissionGrants: {
              select: { action: true, resource: true, expiresAt: true },
            },
          },
        });

        if (!user) {
          // Spend comparable time so an unknown email is indistinguishable.
          await dummyPasswordCheck();
          await logEvent('auth', 'Failed sign-in for unknown account', {
            level: 'WARN',
            detail: { email },
          });
          return null;
        }

        if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
          await logEvent('auth', 'Sign-in blocked: account locked', {
            level: 'WARN',
            detail: { userId: user.id, lockedUntil: user.lockedUntil },
          });
          throw new Error('ACCOUNT_LOCKED');
        }

        if (user.status === UserStatus.SUSPENDED) {
          throw new Error('ACCOUNT_SUSPENDED');
        }
        if (user.status === UserStatus.DEACTIVATED) {
          throw new Error('ACCOUNT_DEACTIVATED');
        }

        const ok = await verifyPassword(password, user.passwordHash);

        if (!ok) {
          const failedLogins = user.failedLogins + 1;
          const shouldLock = failedLogins >= env.LOGIN_MAX_ATTEMPTS;

          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLogins: shouldLock ? 0 : failedLogins,
              lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MS) : null,
            },
          });

          await logEvent('auth', 'Failed sign-in: bad password', {
            level: 'WARN',
            detail: { userId: user.id, failedLogins, locked: shouldLock },
          });
          return null;
        }

        // A teacher or student whose academic profile was deactivated must not
        // be able to sign in even though the login row is still active.
        if (user.role === Role.TEACHER && user.teacherProfile && !user.teacherProfile.isActive) {
          throw new Error('PROFILE_INACTIVE');
        }

        const permissions = Array.from(
          effectivePermissions(user.role, user.permissionGrants),
        );

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
        });

        await logEvent('auth', 'Successful sign-in', {
          detail: { userId: user.id, role: user.role },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
          role: user.role,
          status: user.status,
          campusId: user.campusId,
          locale: user.locale,
          themePref: user.themePref,
          permissions,
          teacherProfileId: user.teacherProfile?.id ?? null,
          studentId: user.studentProfile?.id ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.status = user.status;
        token.campusId = user.campusId ?? null;
        token.locale = user.locale ?? 'en';
        token.themePref = user.themePref ?? 'system';
        token.permissions = user.permissions ?? [];
        token.teacherProfileId = user.teacherProfileId ?? null;
        token.studentId = user.studentId ?? null;
        token.refreshedAt = Math.floor(Date.now() / 1000);
        return token;
      }

      // Re-read authority periodically so a suspended account or a revoked
      // permission takes effect without waiting for the token to expire.
      const REFRESH_SECONDS = 5 * 60;
      const issued = token.refreshedAt ?? 0;
      if (
        trigger === 'update' ||
        Math.floor(Date.now() / 1000) - issued > REFRESH_SECONDS
      ) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.uid },
          select: {
            role: true,
            status: true,
            campusId: true,
            locale: true,
            themePref: true,
            permissionGrants: {
              select: { action: true, resource: true, expiresAt: true },
            },
          },
        });

        if (!fresh || fresh.status !== UserStatus.ACTIVE) {
          // Returning null invalidates the session on the next check.
          return null as never;
        }

        token.role = fresh.role;
        token.status = fresh.status;
        token.campusId = fresh.campusId;
        token.locale = fresh.locale;
        token.themePref = fresh.themePref;
        token.permissions = Array.from(
          effectivePermissions(fresh.role, fresh.permissionGrants),
        );
        token.refreshedAt = Math.floor(Date.now() / 1000);
      }

      return token;
    },
    async session({ session, token }) {
      if (!token?.uid) return session as never;

      session.user = {
        id: token.uid,
        email: token.email as string,
        name: token.name as string,
        emailVerified: null,
        role: token.role,
        status: token.status,
        campusId: token.campusId,
        locale: token.locale,
        themePref: token.themePref,
        permissions: token.permissions ?? [],
        teacherProfileId: token.teacherProfileId ?? null,
        studentId: token.studentId ?? null,
      };

      return session;
    },
  },
});

/** Map the internal error codes thrown by `authorize` to user-facing text. */
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
  default: 'Sign-in failed. Please check your details and try again.',
};

export function authErrorMessage(code?: string | null): string {
  if (!code) return AUTH_ERROR_MESSAGES.default;
  return AUTH_ERROR_MESSAGES[code] ?? AUTH_ERROR_MESSAGES.default;
}
