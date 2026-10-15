import Link from 'next/link';
import { CalendarClock, MessageCircle, ShieldCheck, Wallet } from 'lucide-react';
import { auth } from '@/auth';
import { homeForRole, roleLabel } from '@/lib/rbac';
import { getAcademyProfile } from '@/server/settings';
import { ThemeToggle } from '@/components/app-shell';
import { SwitchAccount } from './switch-account';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

const PORTAL_POINTS = [
  { icon: ShieldCheck, text: 'One account, one role — you only ever see your own records.' },
  { icon: CalendarClock, text: 'Timetables, attendance and results, updated as they are recorded.' },
  { icon: Wallet, text: 'Fee invoices, receipts and outstanding balances for guardians.' },
  { icon: MessageCircle, text: 'Absence and result alerts sent to the registered WhatsApp number.' },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const session = await auth();

  // A signed-in visitor is not bounced to their portal. Doing so made it
  // impossible to sign in as a different user: the form was unreachable and
  // every other login looked broken. Offer an explicit choice instead.
  const existingSession = session?.user?.role
    ? {
        name: session.user.name,
        email: session.user.email,
        roleLabel: roleLabel(session.user.role),
        home: homeForRole(session.user.role),
      }
    : null;

  const params = await searchParams;
  const profile = await getAcademyProfile();

  // `next` must stay a local path, or a crafted link could bounce a freshly
  // signed-in user to an attacker-controlled origin.
  const rawNext = params.next ?? '';
  const safeNext = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '';

  const monogram = profile.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  return (
    <div className="grid min-h-dvh bg-[var(--canvas)] lg:grid-cols-[1.05fr_0.95fr]">
      {/* ------------------------------------------------ Presentation panel */}
      <aside className="relative isolate hidden overflow-hidden border-r border-[var(--line)] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="aurora aurora-animated" aria-hidden />
        <div className="grid-fade pointer-events-none absolute inset-0 opacity-40" aria-hidden />

        <div className="relative">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--brand)] to-[var(--accent)] text-base font-semibold text-[var(--ink-inverse)] shadow-[var(--shadow-md)]">
              {monogram}
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-tight text-[var(--ink)]">
                {profile.name}
              </span>
              <span className="block text-xs text-[var(--ink-subtle)]">{profile.tagline}</span>
            </span>
          </Link>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl leading-[1.1] font-semibold tracking-tight text-[var(--ink)]">
            Welcome back to
            <br />
            <span className="text-gradient">{profile.name}</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed text-[var(--ink-muted)]">
            Sign in to reach your portal. Administrators, teachers, students and parents each
            get their own view of the same academy record.
          </p>

          <ul className="mt-9 space-y-4">
            {PORTAL_POINTS.map((point) => (
              <li key={point.text} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--surface)]/70 text-[var(--brand)] ring-1 ring-[var(--line)]">
                  <point.icon className="size-4" aria-hidden />
                </span>
                <span className="text-sm leading-relaxed text-[var(--ink-muted)]">
                  {point.text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-[var(--ink-subtle)]">
          {profile.address}
        </p>
      </aside>

      {/* ----------------------------------------------------- Form panel */}
      <main className="relative flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm">
          {/* Compact brand mark for small screens, where the aside is hidden. */}
          <div className="mb-8 text-center lg:hidden">
            <span className="mx-auto mb-3 flex size-13 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--brand)] to-[var(--accent)] text-lg font-semibold text-[var(--ink-inverse)] shadow-[var(--shadow-md)]">
              {monogram}
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--ink)]">
              {profile.name}
            </h1>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">Sign in to your academy portal</p>
          </div>

          <div className="hidden lg:block">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--ink)]">Sign in</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Use the email address the academy registered for you.
            </p>
          </div>

          <div className="mt-6">
            {existingSession ? (
              <SwitchAccount session={existingSession} safeNext={safeNext} />
            ) : (
              <LoginForm safeNext={safeNext} initialError={params.error} />
            )}
          </div>

          <div className="mt-8 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-4">
            <p className="text-xs leading-relaxed text-[var(--ink-muted)]">
              <span className="font-medium text-[var(--ink)]">Forgot your password?</span> The
              academy office can reset it for you — passwords are stored hashed and cannot be
              read back.
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-[var(--ink-subtle)]">
            <Link href="/" className="hover:text-[var(--brand)]">
              ← Back to the academy website
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
