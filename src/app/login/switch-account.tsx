'use client';

import * as React from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { ArrowRight, LogOut, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/primitives';

export interface ExistingSession {
  name: string;
  email: string;
  roleLabel: string;
  home: string;
}

/**
 * Shown on /login when the visitor already holds a session.
 *
 * The previous behaviour redirected straight to the signed-in portal, which
 * left no way to reach the sign-in form and made every other account look
 * broken. Here the visitor chooses: continue to their portal, or sign out and
 * sign in as someone else.
 */
export function SwitchAccount({
  session,
  safeNext,
}: {
  session: ExistingSession;
  safeNext: string;
}) {
  const [leaving, setLeaving] = React.useState(false);

  async function switchAccount() {
    setLeaving(true);
    // signOut fetches a CSRF token before posting, which a bare form POST to
    // /api/auth/signout does not, and then clears the session cookie.
    await signOut({ redirect: false });
    // Full reload so the server renders a clean, unauthenticated login page.
    window.location.href = safeNext ? `/login?next=${encodeURIComponent(safeNext)}` : '/login';
  }

  return (
    <div className="card space-y-4 p-6 shadow-[var(--shadow-md)]">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-[var(--brand-soft-ink)]">
          <UserRound className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-[var(--ink-muted)]">You are already signed in as</p>
          <p className="truncate text-sm font-medium text-[var(--ink)]">{session.name}</p>
          <p className="truncate text-xs text-[var(--ink-subtle)]">
            {session.roleLabel} · {session.email}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Link href={session.home} className="block">
          <Button variant="primary" size="lg" className="w-full">
            Continue to my portal
            <ArrowRight />
          </Button>
        </Link>

        <Button
          variant="outline"
          size="lg"
          className="w-full"
          loading={leaving}
          onClick={switchAccount}
        >
          {!leaving && <LogOut />}
          {leaving ? 'Signing out…' : 'Sign in as a different user'}
        </Button>
      </div>

      <p className="text-center text-xs leading-relaxed text-[var(--ink-subtle)]">
        To reach a teacher, student or parent account, sign out first — the academy keeps
        one session per browser.
      </p>
    </div>
  );
}
