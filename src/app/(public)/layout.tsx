import Link from 'next/link';
import { GraduationCap, Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { PUBLIC_NAV } from '@/lib/navigation';
import { getAcademyProfile } from '@/server/settings';
import { Button } from '@/components/ui/primitives';
import { BackToTop } from '@/components/marketing/back-to-top';
import { WhatsAppFloat } from '@/components/marketing/whatsapp-float';

const PORTAL_LINKS = [
  { href: '/login', label: 'Administrator' },
  { href: '/login', label: 'Teacher' },
  { href: '/login', label: 'Student' },
  { href: '/login', label: 'Parent' },
];

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getAcademyProfile();

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--canvas)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--brand)] focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--ink-inverse)]"
      >
        Skip to content
      </a>

      <header className="glass sticky top-0 z-30 border-b border-[var(--line)]">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="relative flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--brand)] to-[var(--accent)] text-[var(--ink-inverse)] shadow-[var(--shadow-sm)] transition-transform duration-300 group-hover:scale-105">
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

          <nav className="ml-auto hidden items-center gap-0.5 lg:flex" aria-label="Main">
            {PUBLIC_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="relative rounded-md px-3 py-2 text-sm font-medium text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]"
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
              <Button size="sm" className="glow-brand">
                Apply now
              </Button>
            </Link>
          </div>

          <details className="relative lg:hidden">
            <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface-hover)]">
              <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden>
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span className="sr-only">Open menu</span>
            </summary>
            <nav
              className="absolute right-0 mt-2 w-56 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-lg)]"
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

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="relative border-t border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--brand)] to-[var(--accent)] text-[var(--ink-inverse)]">
                <GraduationCap className="size-4.5" />
              </span>
              <span className="text-sm font-semibold text-[var(--ink)]">{profile.name}</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[var(--ink-muted)]">
              {profile.tagline}. Admissions, timetables, attendance, fees, examinations and
              online learning in one platform for administrators, teachers, students and parents.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.6875rem] text-[var(--ink-subtle)]">
              <ShieldCheck className="size-3.5" aria-hidden />
              Role-based access · Audit logged
            </p>
          </div>

          <div>
            <h2 className="text-xs font-semibold tracking-wider text-[var(--ink)] uppercase">
              Explore
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {PUBLIC_NAV.map((item) => (
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
              Get in touch
            </h2>
            <ul className="mt-4 space-y-3 text-sm text-[var(--ink-muted)]">
              <li className="flex gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--ink-subtle)]" aria-hidden />
                <span>{profile.address}</span>
              </li>
              <li className="flex gap-2.5">
                <Phone className="mt-0.5 size-4 shrink-0 text-[var(--ink-subtle)]" aria-hidden />
                <a href={`tel:${profile.phone}`} className="hover:text-[var(--brand)]">
                  {profile.phone}
                </a>
              </li>
              <li className="flex gap-2.5">
                <Mail className="mt-0.5 size-4 shrink-0 text-[var(--ink-subtle)]" aria-hidden />
                <a href={`mailto:${profile.email}`} className="hover:text-[var(--brand)]">
                  {profile.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[var(--line)]">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--ink-subtle)]">
              <span className="font-medium text-[var(--ink-muted)]">Portals</span>
              {PORTAL_LINKS.map((portal) => (
                <Link
                  key={portal.label}
                  href={portal.href}
                  className="transition-colors hover:text-[var(--brand)]"
                >
                  {portal.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--line)]">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-[var(--ink-subtle)] sm:px-6">
            <p>
              © {new Date().getFullYear()} {profile.name}. All rights reserved.
            </p>
            <p>Academy Management ERP &amp; LMS</p>
          </div>
        </div>
      </footer>

      <WhatsAppFloat phone={profile.phone} academyName={profile.name} />
      <BackToTop />
    </div>
  );
}
