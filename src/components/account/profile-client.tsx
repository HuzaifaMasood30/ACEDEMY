'use client';

import * as React from 'react';
import { signOut } from 'next-auth/react';
import { BadgeCheck, KeyRound, LogOut, Save, ShieldCheck, UserRound } from 'lucide-react';
import { Alert, Badge, Button, Field, Input, Select } from '@/components/ui/primitives';
import { Card, CardHeader, DetailList, PageHeader } from '@/components/ui/structure';
import { api } from '@/lib/client-api';
import { useMutation } from '@/lib/use-resource';
import { formatDateTime, titleCase } from '@/lib/format';

interface AccountProfile {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  role: string;
  status: string;
  avatarUrl: string | null;
  locale: string;
  themePref: string;
  emailVerified: string | null;
  phoneVerified: string | null;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  teacherProfile: { id: string; designation: string | null; employeeCode: string | null } | null;
  studentProfile: {
    id: string;
    admissionNo: string;
    firstName: string;
    lastName: string;
    rollNo: string | null;
  } | null;
}

export function ProfileClient({ description }: { description: string }) {
  const [profile, setProfile] = React.useState<AccountProfile | null>(null);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [locale, setLocale] = React.useState('en');
  const [themePref, setThemePref] = React.useState('system');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [passwordError, setPasswordError] = React.useState<string | null>(null);

  const { run: saveProfile, pending: savingProfile } = useMutation();
  const { run: savePassword, pending: savingPassword } = useMutation();

  const load = React.useCallback(() => {
    setLoading(true);
    api
      .getOne<AccountProfile>('/api/account')
      .then((data) => {
        setProfile(data);
        setName(data.name);
        setPhone(data.phone ?? '');
        setLocale(data.locale);
        setThemePref(data.themePref);
        setError(null);
      })
      .catch(() => setError('Could not load your account.'))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const dirty =
    profile != null &&
    (name !== profile.name ||
      phone !== (profile.phone ?? '') ||
      locale !== profile.locale ||
      themePref !== profile.themePref);

  const submitProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await saveProfile(
      () =>
        api.put('/api/account', {
          action: 'profile',
          name,
          phone: phone || null,
          locale,
          themePref,
        }),
      { success: 'Profile updated.' },
    );
    if (result) load();
  };

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(null);

    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }

    const result = await savePassword(
      () =>
        api.put('/api/account', {
          action: 'password',
          currentPassword,
          newPassword,
        }),
      { success: 'Password changed. Signing you out…' },
    );

    if (result) {
      // All sessions were revoked server-side, so end this one too.
      setTimeout(() => signOut({ callbackUrl: '/login' }), 1200);
    } else {
      setPasswordError('Could not change your password. Check your current password.');
    }
  };

  if (loading && !profile) {
    return (
      <div className="space-y-6">
        <PageHeader title="My profile" description={description} />
        <Card>
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My profile"
        description={description}
        actions={
          <Button variant="outline" onClick={() => signOut({ callbackUrl: '/login' })}>
            <LogOut />
            Sign out
          </Button>
        }
      />

      {error && (
        <Alert tone="danger" title="Account unavailable">
          {error}
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Account details"
            description="Your name and contact details as they appear across the academy."
            icon={<UserRound />}
          />
          <form onSubmit={submitProfile} className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="pf-name" required>
                <Input
                  id="pf-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                />
              </Field>
              <Field
                label="Email"
                htmlFor="pf-email"
                hint="Only an administrator can change your sign-in email."
              >
                <Input id="pf-email" value={profile?.email ?? ''} readOnly disabled />
              </Field>
              <Field label="Phone" htmlFor="pf-phone">
                <Input
                  id="pf-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+92 300 0000000"
                />
              </Field>
              <Field label="Interface language" htmlFor="pf-locale">
                <Select id="pf-locale" value={locale} onChange={(e) => setLocale(e.target.value)}>
                  <option value="en">English</option>
                  <option value="ur">Urdu</option>
                </Select>
              </Field>
              <Field
                label="Theme"
                htmlFor="pf-theme"
                hint="Your preference is stored on your account."
              >
                <Select
                  id="pf-theme"
                  value={themePref}
                  onChange={(e) => setThemePref(e.target.value)}
                >
                  <option value="system">Match system</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </Select>
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={savingProfile} disabled={!dirty}>
                <Save />
                Save changes
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader title="Account" icon={<ShieldCheck />} />
          <div className="p-4 sm:p-5">
            <DetailList
              columns={1}
              items={[
                {
                  label: 'Role',
                  value: <Badge tone="brand">{titleCase(profile?.role ?? '')}</Badge>,
                },
                {
                  label: 'Status',
                  value: (
                    <Badge tone={profile?.status === 'ACTIVE' ? 'success' : 'warning'}>
                      {titleCase(profile?.status ?? '')}
                    </Badge>
                  ),
                },
                {
                  label: 'Email verified',
                  value: profile?.emailVerified ? (
                    <span className="inline-flex items-center gap-1 text-[var(--ok)]">
                      <BadgeCheck className="size-3.5" />
                      {formatDateTime(profile.emailVerified)}
                    </span>
                  ) : (
                    'Not verified'
                  ),
                },
                {
                  label: 'Multi-factor authentication',
                  value: profile?.mfaEnabled ? 'Enabled' : 'Not enabled',
                },
                {
                  label: 'Last sign-in',
                  value: profile?.lastLoginAt ? formatDateTime(profile.lastLoginAt) : '—',
                },
                {
                  label: 'Member since',
                  value: profile?.createdAt ? formatDateTime(profile.createdAt) : '—',
                },
                ...(profile?.teacherProfile
                  ? [
                      {
                        label: 'Employee number',
                        value: profile.teacherProfile.employeeCode ?? '—',
                      },
                      {
                        label: 'Designation',
                        value: profile.teacherProfile.designation ?? '—',
                      },
                    ]
                  : []),
                ...(profile?.studentProfile
                  ? [
                      {
                        label: 'Admission number',
                        value: profile.studentProfile.admissionNo,
                      },
                      {
                        label: 'Roll number',
                        value: profile.studentProfile.rollNo ?? '—',
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Change password"
          description="Changing your password signs you out of every device, including this one."
          icon={<KeyRound />}
        />
        <form onSubmit={submitPassword} className="space-y-4 p-4 sm:p-5">
          {passwordError && <Alert tone="danger">{passwordError}</Alert>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Current password" htmlFor="pf-cur" required>
              <Input
                id="pf-cur"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </Field>
            <Field
              label="New password"
              htmlFor="pf-new"
              required
              hint="At least 8 characters with a letter and a number."
            >
              <Input
                id="pf-new"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </Field>
            <Field label="Confirm new password" htmlFor="pf-conf" required>
              <Input
                id="pf-conf"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="outline" loading={savingPassword}>
              <KeyRound />
              Change password
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
