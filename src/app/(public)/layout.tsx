import Link from 'next/link';
import { GraduationCap, Menu } from 'lucide-react';
import { PUBLIC_NAV } from '@/lib/navigation';
import { getAcademyProfile } from '@/server/settings';
import { Button } from '@/components/ui/primitives';

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getAcademyProfile();

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--canvas)]">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--surface)]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--brand)] text-[var(--ink-inverse)] shadow-[var(--shadow-sm)]">
              <GraduationCap className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight text-[var(--ink)]">
                {profile.name}
              </span>
              <span className="hidden truncate text-[0.6875rem] text-[var(--ink-subtle)] sm:block">
                {profile.tagline}
              </span>
            </span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Main">
            {PUBLIC_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <Link href="/login" className="hidden sm:block">
              <Button variant="outline" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href="/admissions">
              <Button size="sm">Apply now</Button>
            </Link>
          </div>

          <details className="relative lg:hidden">
            <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface-hover)]">
              <Menu className="size-5" />
              <span className="sr-only">Open menu</span>
            </summary>
            <nav
              className="absolute right-0 mt-2 w-52 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-lg)]"
              aria-label="Mobile"
            >
              {PUBLIC_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-md px-3 py-2 text-sm text-[var(--ink-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/login"
                className="mt-1 block rounded-md border-t border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--brand)]"
              >
                Sign in
              </Link>
            </nav>
          </details>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--brand)] text-[var(--ink-inverse)]">
                <GraduationCap className="size-4.5" />
              </span>
              <span className="text-sm font-semibold text-[var(--ink)]">{profile.name}</span>
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--ink-muted)]">
              {profile.tagline}. A complete academy management platform covering admissions,
              timetables, attendance, fees, examinations and online learning.
            </p>
          </div>

          <div>
            <h2 className="text-xs font-semibold tracking-wider text-[var(--ink)] uppercase">
              Academy
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {PUBLIC_NAV.slice(1).map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-[var(--ink-muted)] transition-colors hover:text-[var(--brand)]"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold tracking-wider text-[var(--ink)] uppercase">
              Contact
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-[var(--ink-muted)]">
              <li>{profile.address}</li>
              <li>
                <a href={`tel:${profile.phone}`} className="hover:text-[var(--brand)]">
                  {profile.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${profile.email}`} className="hover:text-[var(--brand)]">
                  {profile.email}
                </a>
              </li>
              <li>
                <Link href="/login" className="font-medium text-[var(--brand)]">
                  Portal sign in
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[var(--line)]">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-[var(--ink-subtle)] sm:px-6">
            <p>
              © {new Date().getFullYear()} {profile.name}. All rights reserved.
            </p>
            <p>Academy Management ERP — demonstration deployment</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
