import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { homeForRole } from '@/lib/rbac';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const session = await auth();

  if (session?.user?.role) {
    redirect(homeForRole(session.user.role));
  }

  const params = await searchParams;

  // `next` must stay a local path, or a crafted link could bounce a freshly
  // signed-in user to an attacker-controlled origin.
  const rawNext = params.next ?? '';
  const safeNext = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '';

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[var(--canvas)] px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        aria-hidden
        style={{
          backgroundImage:
            'radial-gradient(circle at 15% 20%, var(--brand-soft) 0%, transparent 45%), radial-gradient(circle at 85% 75%, var(--accent-soft) 0%, transparent 45%)',
        }}
      />
      <div className="surface-grid pointer-events-none absolute inset-0 opacity-[0.16]" aria-hidden />

      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-13 items-center justify-center rounded-xl bg-[var(--brand)] text-[var(--ink-inverse)] shadow-[var(--shadow-md)]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-7"
              aria-hidden
            >
              <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
              <path d="M22 10v6" />
              <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
            Al-Noor Academy
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Sign in to your academy portal
          </p>
        </div>

        <LoginForm safeNext={safeNext} initialError={params.error} />

        <p className="mt-6 text-center text-xs text-[var(--ink-subtle)]">
          Administrators, teachers, students and parents each have their own portal.
          <br />
          Contact the academy office if you cannot access your account.
        </p>
      </div>
    </div>
  );
}
