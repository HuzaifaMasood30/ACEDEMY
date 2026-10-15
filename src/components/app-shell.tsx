'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import * as Icons from 'lucide-react';
import {
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  Sun,
  Monitor,
  X,
  ChevronLeft,
  Bell,
  UserCog,
} from 'lucide-react';
import { cn, initials } from '@/lib/format';
import type { NavSection } from '@/lib/navigation';
import { Button } from '@/components/ui/primitives';
import type { Role } from '@prisma/client';

/** Resolve an icon by name from the navigation declaration. */
function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
    name
  ];
  if (!Icon) return null;
  return <Icon className={className} />;
}

export interface ShellUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: string[];
  avatarUrl?: string | null;
}

export interface ShellProps {
  user: ShellUser;
  sections: NavSection[];
  children: React.ReactNode;
  /** Short label shown in the sidebar header, e.g. "Administration". */
  portalName: string;
  portalBadge?: string;
  unreadNotifications?: number;
  profileHref: string;
}

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrator',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
  PARENT: 'Parent',
};

export function AppShell({
  user,
  sections,
  children,
  portalName,
  portalBadge,
  unreadNotifications = 0,
  profileHref,
}: ShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  // Close overlays whenever the route changes.
  React.useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const visibleSections = React.useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) =>
              !item.permissions ||
              item.permissions.some((p) => user.permissions.includes(p)),
          ),
        }))
        .filter((section) => section.items.length > 0),
    [sections, user.permissions],
  );

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const currentTitle = React.useMemo(() => {
    for (const section of visibleSections) {
      for (const item of section.items) {
        if (isActive(item.href, item.exact)) return item.label;
      }
    }
    return portalName;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, visibleSections, portalName]);

  return (
    <div className="min-h-dvh bg-[var(--canvas)]">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="animate-fade fixed inset-0 z-30 bg-[var(--overlay)] lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[var(--line)] bg-[var(--surface)] transition-[transform,width] duration-200 ease-out',
          collapsed ? 'w-[4.5rem]' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-15 items-center gap-2.5 border-b border-[var(--line)] px-4">
          <Link
            href={sections[0]?.items[0]?.href ?? '/'}
            className="flex min-w-0 items-center gap-2.5"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)] text-[var(--ink-inverse)] shadow-[var(--shadow-sm)]">
              <Icons.GraduationCap className="size-5" />
            </span>
            {!collapsed && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold tracking-tight text-[var(--ink)]">
                  Academy ERP
                </span>
                <span className="block truncate text-[0.6875rem] text-[var(--ink-subtle)]">
                  {portalName}
                </span>
              </span>
            )}
          </Link>

          <Button
            variant="ghost"
            size="iconSm"
            className="ml-auto lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X />
          </Button>
        </div>

        {portalBadge && !collapsed && (
          <div className="border-b border-[var(--line)] px-4 py-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-[0.6875rem] font-medium text-[var(--brand-soft-ink)]">
              <span className="size-1.5 rounded-full bg-[var(--brand)]" />
              {portalBadge}
            </span>
          </div>
        )}

        <nav
          className="scrollbar-slim flex-1 overflow-y-auto px-3 py-3"
          aria-label={`${portalName} navigation`}
        >
          {visibleSections.map((section) => (
            <div key={section.title} className="mb-4 last:mb-0">
              {!collapsed && (
                <p className="mb-1.5 px-2 text-[0.6875rem] font-semibold tracking-wider text-[var(--ink-subtle)] uppercase">
                  {section.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href, item.exact);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                          collapsed && 'justify-center px-0',
                          active
                            ? 'bg-[var(--brand-soft)] text-[var(--brand-soft-ink)]'
                            : 'text-[var(--ink-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]',
                        )}
                      >
                        {active && (
                          <span
                            className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r bg-[var(--brand)]"
                            aria-hidden
                          />
                        )}
                        <NavIcon
                          name={item.icon}
                          className={cn(
                            'size-4.5 shrink-0 transition-transform duration-150 group-hover:scale-105',
                            active && 'text-[var(--brand)]',
                          )}
                        />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--line)] p-3">
          <Button
            variant="ghost"
            size="sm"
            className="hidden w-full justify-start lg:inline-flex"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft
              className={cn('transition-transform duration-200', collapsed && 'rotate-180')}
            />
            {!collapsed && 'Collapse'}
          </Button>
        </div>
      </aside>

      {/* Main column */}
      <div
        className={cn(
          'flex min-h-dvh flex-col transition-[padding] duration-200 ease-out',
          collapsed ? 'lg:pl-[4.5rem]' : 'lg:pl-64',
        )}
      >
        <header className="sticky top-0 z-20 flex h-15 items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)]/85 px-4 backdrop-blur-md sm:px-6">
          <Button
            variant="ghost"
            size="iconSm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </Button>

          <h1 className="truncate text-sm font-semibold text-[var(--ink)] sm:text-base">
            {currentTitle}
          </h1>

          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />

            <Link
              href={profileHref}
              className="relative rounded-md p-2 text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]"
              aria-label={`Notifications${unreadNotifications > 0 ? `, ${unreadNotifications} unread` : ''}`}
            >
              <Bell className="size-4.5" />
              {unreadNotifications > 0 && (
                <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-[var(--danger)] text-[0.5625rem] font-bold text-white">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </Link>

            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-md py-1.5 pr-2 pl-1.5 transition-colors hover:bg-[var(--surface-hover)]"
              >
                <span className="flex size-7.5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-semibold text-[var(--ink-inverse)]">
                  {initials(user.name)}
                </span>
                <span className="hidden min-w-0 text-left sm:block">
                  <span className="block max-w-[9rem] truncate text-xs font-medium text-[var(--ink)]">
                    {user.name}
                  </span>
                  <span className="block text-[0.6875rem] text-[var(--ink-subtle)]">
                    {ROLE_LABEL[user.role]}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    'size-3.5 text-[var(--ink-subtle)] transition-transform',
                    userMenuOpen && 'rotate-180',
                  )}
                />
              </button>

              {userMenuOpen && (
                <div
                  role="menu"
                  className="animate-scale-in absolute right-0 mt-2 w-60 origin-top-right rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-lg)]"
                >
                  <div className="border-b border-[var(--line)] px-2.5 py-2">
                    <p className="truncate text-sm font-medium text-[var(--ink)]">{user.name}</p>
                    <p className="truncate text-xs text-[var(--ink-subtle)]">{user.email}</p>
                  </div>

                  <Link
                    href={profileHref}
                    role="menuitem"
                    className="mt-1 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]"
                  >
                    <UserCog className="size-4" />
                    Profile & settings
                  </Link>

                  <form action="/api/auth/signout" method="post">
                    <button
                      type="submit"
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-[var(--danger)] transition-colors hover:bg-[var(--danger-soft)]"
                    >
                      <LogOut className="size-4" />
                      Sign out
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const options = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ] as const;

  if (!mounted) {
    return <div className="size-9" aria-hidden />;
  }

  const currentIndex = options.findIndex((o) => o.value === theme);
  const next = options[(currentIndex + 1) % options.length];
  const CurrentIcon = options[currentIndex === -1 ? 2 : currentIndex].icon;

  return (
    <Button
      variant="ghost"
      size="iconSm"
      onClick={() => setTheme(next.value)}
      aria-label={`Theme: ${options[currentIndex === -1 ? 2 : currentIndex].label}. Switch to ${next.label}.`}
      title={`Theme: ${options[currentIndex === -1 ? 2 : currentIndex].label}`}
    >
      <CurrentIcon />
    </Button>
  );
}
