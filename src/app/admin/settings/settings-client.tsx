'use client';

import * as React from 'react';
import {
  BellRing,
  Building2,
  CalendarRange,
  Coins,
  Percent,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from 'lucide-react';
import { Alert, Badge, Button, Field, Input, Switch } from '@/components/ui/primitives';
import { Card, CardHeader, PageHeader, SectionHeading } from '@/components/ui/structure';
import { Tabs } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation } from '@/lib/use-resource';
import { titleCase } from '@/lib/format';

interface AttendanceRules {
  minimumPercentage: number;
  consecutiveAbsenceThreshold: number;
  editWindowDays: number;
  requireApprovalForEdits: boolean;
  notifyGuardiansOnAbsence: boolean;
  notifyOnLateArrival: boolean;
}

interface FeeRules {
  invoicePrefix: string;
  receiptPrefix: string;
  lateFeeGraceDays: number;
  lateFeeAmount: number;
  lateFeeIsPercentage: boolean;
  reminderOffsetsDays: number[];
}

interface NotificationRules {
  absenceNotificationsEnabled: boolean;
  resultNotificationsEnabled: boolean;
  feeReminderEnabled: boolean;
  examReminderEnabled: boolean;
  examReminderLeadDays: number;
  bulkRateLimitPerHour: number;
  respectQuietHours: boolean;
}

interface AcademicRules {
  passingPercentage: number;
  promotionMinimumAttendance: number;
  promotionMinimumPercentage: number;
  studentIdPrefix: string;
  duplicateDetectionFields: string[];
}

interface GradingDefaults {
  defaultScaleName: string;
  showRankInResults: boolean;
  roundToDecimals: number;
}

interface AcademyProfile {
  name: string;
  tagline: string;
  email: string;
  phone: string;
  address: string;
  website: string;
}

interface GradeBand {
  grade: string;
  minPercent: number;
  maxPercent: number;
  gpa: number | null;
  remark: string | null;
}

interface SettingsPayload {
  attendance: AttendanceRules;
  fee: FeeRules;
  notification: NotificationRules;
  academic: AcademicRules;
  grading: GradingDefaults;
  academy: AcademyProfile;
  gradeScale: { id: string; name: string; bands: GradeBand[] } | null;
}

type Block = 'attendance' | 'fee' | 'notification' | 'academic' | 'grading' | 'academy';

const BLOCKS: Array<{ value: Block; label: string; icon: React.ReactNode }> = [
  { value: 'academy', label: 'Academy profile', icon: <Building2 /> },
  { value: 'attendance', label: 'Attendance rules', icon: <CalendarRange /> },
  { value: 'fee', label: 'Fee rules', icon: <Coins /> },
  { value: 'notification', label: 'Notifications', icon: <BellRing /> },
  { value: 'academic', label: 'Academic rules', icon: <Percent /> },
  { value: 'grading', label: 'Grading', icon: <SlidersHorizontal /> },
];

export function SettingsClient() {
  const [block, setBlock] = React.useState<Block>('academy');
  const [data, setData] = React.useState<SettingsPayload | null>(null);
  const [draft, setDraft] = React.useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { run, pending } = useMutation();

  const load = React.useCallback(() => {
    setLoading(true);
    api
      .getOne<SettingsPayload>('/api/admin/settings')
      .then((payload) => {
        setData(payload);
        setError(null);
      })
      .catch(() => setError('Could not load settings.'))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Reset the working copy whenever the block changes, so edits never leak
  // from one settings section into another.
  React.useEffect(() => {
    if (!data) return;
    setDraft({ ...(data[block] as unknown as Record<string, unknown>) });
  }, [block, data]);

  const dirty = React.useMemo(() => {
    if (!data || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(data[block]);
  }, [data, draft, block]);

  const set = (key: string, value: unknown) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const save = async () => {
    if (!draft) return;
    const result = await run(
      () => api.put('/api/admin/settings', { block, values: draft }),
      { success: 'Settings saved.' },
    );
    if (result) load();
  };

  const revert = () => {
    if (data) setDraft({ ...(data[block] as unknown as Record<string, unknown>) });
  };

  const num = (key: string) => Number(draft?.[key] ?? 0);
  const str = (key: string) => String(draft?.[key] ?? '');
  const bool = (key: string) => Boolean(draft?.[key]);

  const renderBlock = () => {
    if (!draft) return null;

    if (block === 'academy') {
      return (
        <Card>
          <CardHeader
            title="Academy identity"
            description="Used across the public site, invoices, receipts and message templates."
            icon={<Building2 />}
          />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <Field label="Academy name" htmlFor="ac-name" required>
              <Input id="ac-name" value={str('name')} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Tagline" htmlFor="ac-tagline">
              <Input
                id="ac-tagline"
                value={str('tagline')}
                onChange={(e) => set('tagline', e.target.value)}
              />
            </Field>
            <Field label="Contact email" htmlFor="ac-email" required>
              <Input
                id="ac-email"
                type="email"
                value={str('email')}
                onChange={(e) => set('email', e.target.value)}
              />
            </Field>
            <Field label="Phone" htmlFor="ac-phone">
              <Input id="ac-phone" value={str('phone')} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="Website" htmlFor="ac-web" className="sm:col-span-2">
              <Input id="ac-web" value={str('website')} onChange={(e) => set('website', e.target.value)} />
            </Field>
            <Field label="Address" htmlFor="ac-address" className="sm:col-span-2">
              <Input
                id="ac-address"
                value={str('address')}
                onChange={(e) => set('address', e.target.value)}
              />
            </Field>
          </div>
        </Card>
      );
    }

    if (block === 'attendance') {
      return (
        <Card>
          <CardHeader
            title="Attendance rules"
            description="Thresholds used for percentage calculations, absence alerts and edit approvals."
            icon={<CalendarRange />}
          />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <Field
              label="Minimum attendance (%)"
              htmlFor="at-min"
              hint="Students below this are flagged in alerts and progress reports."
            >
              <Input
                id="at-min"
                type="number"
                min={0}
                max={100}
                value={num('minimumPercentage')}
                onChange={(e) => set('minimumPercentage', Number(e.target.value))}
              />
            </Field>
            <Field
              label="Consecutive absences before an alert"
              htmlFor="at-consec"
              hint="Counts school days, not calendar days."
            >
              <Input
                id="at-consec"
                type="number"
                min={1}
                max={30}
                value={num('consecutiveAbsenceThreshold')}
                onChange={(e) => set('consecutiveAbsenceThreshold', Number(e.target.value))}
              />
            </Field>
            <Field
              label="Edit window (days)"
              htmlFor="at-window"
              hint="Editing older records requires the approval permission."
            >
              <Input
                id="at-window"
                type="number"
                min={0}
                max={30}
                value={num('editWindowDays')}
                onChange={(e) => set('editWindowDays', Number(e.target.value))}
              />
            </Field>
            <div className="space-y-3 self-end pb-1">
              <Switch
                checked={bool('requireApprovalForEdits')}
                onChange={(next) => set('requireApprovalForEdits', next)}
                label="Teacher edits need administrator approval"
              />
              <Switch
                checked={bool('notifyGuardiansOnAbsence')}
                onChange={(next) => set('notifyGuardiansOnAbsence', next)}
                label="Notify guardians when a student is absent"
              />
              <Switch
                checked={bool('notifyOnLateArrival')}
                onChange={(next) => set('notifyOnLateArrival', next)}
                label="Notify guardians on late arrival"
              />
            </div>
          </div>
        </Card>
      );
    }

    if (block === 'fee') {
      const offsets = Array.isArray(draft.reminderOffsetsDays)
        ? (draft.reminderOffsetsDays as number[])
        : [];
      return (
        <Card>
          <CardHeader
            title="Fee rules"
            description="Numbering prefixes, late-fee policy and reminder scheduling."
            icon={<Coins />}
          />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <Field
              label="Invoice prefix"
              htmlFor="fe-inv"
              hint="Changing this affects newly generated invoices only."
            >
              <Input
                id="fe-inv"
                value={str('invoicePrefix')}
                onChange={(e) => set('invoicePrefix', e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Receipt prefix" htmlFor="fe-rcp">
              <Input
                id="fe-rcp"
                value={str('receiptPrefix')}
                onChange={(e) => set('receiptPrefix', e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Late-fee grace period (days)" htmlFor="fe-grace">
              <Input
                id="fe-grace"
                type="number"
                min={0}
                max={90}
                value={num('lateFeeGraceDays')}
                onChange={(e) => set('lateFeeGraceDays', Number(e.target.value))}
              />
            </Field>
            <Field
              label={bool('lateFeeIsPercentage') ? 'Late fee (%)' : 'Late fee amount'}
              htmlFor="fe-amount"
              hint={bool('lateFeeIsPercentage') ? 'Percentage of the outstanding amount.' : 'Flat charge in the academy currency.'}
            >
              <Input
                id="fe-amount"
                type="number"
                min={0}
                step="0.01"
                value={num('lateFeeAmount')}
                onChange={(e) => set('lateFeeAmount', Number(e.target.value))}
              />
            </Field>
            <div className="space-y-3 self-end pb-1 sm:col-span-2">
              <Switch
                checked={bool('lateFeeIsPercentage')}
                onChange={(next) => set('lateFeeIsPercentage', next)}
                label="Charge the late fee as a percentage rather than a flat amount"
              />
            </div>
            <Field
              label="Reminder offsets (days relative to due date)"
              htmlFor="fe-offsets"
              hint="Comma-separated. Negative values remind before the due date, positive after."
              className="sm:col-span-2"
            >
              <Input
                id="fe-offsets"
                value={offsets.join(', ')}
                onChange={(e) =>
                  set(
                    'reminderOffsetsDays',
                    e.target.value
                      .split(',')
                      .map((v) => v.trim())
                      .filter((v) => v !== '' && !Number.isNaN(Number(v)))
                      .map(Number),
                  )
                }
                placeholder="-7, -3, 0, 3, 7"
              />
            </Field>
          </div>
        </Card>
      );
    }

    if (block === 'notification') {
      return (
        <Card>
          <CardHeader
            title="Notification rules"
            description="Controls which automated messages are queued and how aggressively they are sent."
            icon={<BellRing />}
          />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <div className="space-y-3">
              <Switch
                checked={bool('absenceNotificationsEnabled')}
                onChange={(next) => set('absenceNotificationsEnabled', next)}
                label="Absence notifications"
              />
              <Switch
                checked={bool('resultNotificationsEnabled')}
                onChange={(next) => set('resultNotificationsEnabled', next)}
                label="Result publication notifications"
              />
              <Switch
                checked={bool('feeReminderEnabled')}
                onChange={(next) => set('feeReminderEnabled', next)}
                label="Fee reminders"
              />
              <Switch
                checked={bool('examReminderEnabled')}
                onChange={(next) => set('examReminderEnabled', next)}
                label="Exam reminders"
              />
              <Switch
                checked={bool('respectQuietHours')}
                onChange={(next) => set('respectQuietHours', next)}
                label="Hold messages during quiet hours"
              />
            </div>
            <div className="space-y-4">
              <Field
                label="Exam reminder lead time (days)"
                htmlFor="no-lead"
                hint="How far ahead of an exam the reminder is queued."
              >
                <Input
                  id="no-lead"
                  type="number"
                  min={0}
                  max={60}
                  value={num('examReminderLeadDays')}
                  onChange={(e) => set('examReminderLeadDays', Number(e.target.value))}
                />
              </Field>
              <Field
                label="Bulk messages per hour"
                htmlFor="no-bulk"
                hint="Hard ceiling for manual bulk announcements, protecting provider limits."
              >
                <Input
                  id="no-bulk"
                  type="number"
                  min={0}
                  max={10000}
                  value={num('bulkRateLimitPerHour')}
                  onChange={(e) => set('bulkRateLimitPerHour', Number(e.target.value))}
                />
              </Field>
            </div>
          </div>
        </Card>
      );
    }

    if (block === 'academic') {
      const fields = Array.isArray(draft.duplicateDetectionFields)
        ? (draft.duplicateDetectionFields as string[])
        : [];
      return (
        <Card>
          <CardHeader
            title="Academic rules"
            description="Promotion criteria, student numbering and duplicate detection."
            icon={<Percent />}
          />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <Field
              label="Passing percentage (%)"
              htmlFor="ac-pass"
              hint="Used to mark subjects as passed or failed in results."
            >
              <Input
                id="ac-pass"
                type="number"
                min={0}
                max={100}
                value={num('passingPercentage')}
                onChange={(e) => set('passingPercentage', Number(e.target.value))}
              />
            </Field>
            <Field label="Student ID prefix" htmlFor="ac-prefix">
              <Input
                id="ac-prefix"
                value={str('studentIdPrefix')}
                onChange={(e) => set('studentIdPrefix', e.target.value.toUpperCase())}
              />
            </Field>
            <Field
              label="Promotion minimum attendance (%)"
              htmlFor="ac-promatt"
              hint="Advisory only — promotion is never applied automatically."
            >
              <Input
                id="ac-promatt"
                type="number"
                min={0}
                max={100}
                value={num('promotionMinimumAttendance')}
                onChange={(e) => set('promotionMinimumAttendance', Number(e.target.value))}
              />
            </Field>
            <Field label="Promotion minimum marks (%)" htmlFor="ac-prommarks">
              <Input
                id="ac-prommarks"
                type="number"
                min={0}
                max={100}
                value={num('promotionMinimumPercentage')}
                onChange={(e) => set('promotionMinimumPercentage', Number(e.target.value))}
              />
            </Field>
            <Field
              label="Duplicate detection fields"
              htmlFor="ac-dup"
              hint="Comma-separated student fields compared when an admission is submitted."
              className="sm:col-span-2"
            >
              <Input
                id="ac-dup"
                value={fields.join(', ')}
                onChange={(e) =>
                  set(
                    'duplicateDetectionFields',
                    e.target.value
                      .split(',')
                      .map((v) => v.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="firstName, lastName, dateOfBirth"
              />
            </Field>
          </div>
        </Card>
      );
    }

    if (block === 'grading') {
      return (
        <>
          <Card>
            <CardHeader
              title="Grading defaults"
              description="Applies wherever a specific course does not override the marking scheme."
              icon={<SlidersHorizontal />}
            />
            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
              <Field label="Default scale name" htmlFor="gr-scale">
                <Input
                  id="gr-scale"
                  value={str('defaultScaleName')}
                  onChange={(e) => set('defaultScaleName', e.target.value)}
                />
              </Field>
              <Field
                label="Round results to (decimals)"
                htmlFor="gr-round"
                hint="Applied when percentages and GPAs are computed."
              >
                <Input
                  id="gr-round"
                  type="number"
                  min={0}
                  max={4}
                  value={num('roundToDecimals')}
                  onChange={(e) => set('roundToDecimals', Number(e.target.value))}
                />
              </Field>
              <div className="self-end pb-1 sm:col-span-2">
                <Switch
                  checked={bool('showRankInResults')}
                  onChange={(next) => set('showRankInResults', next)}
                  label="Show class rank on published results"
                />
              </div>
            </div>
          </Card>

          {data?.gradeScale && (
            <Card>
              <CardHeader
                title={`Grade bands — ${data.gradeScale.name}`}
                description="Grade boundaries are managed on the Grading scales page."
                icon={<Percent />}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-left text-xs text-[var(--ink-subtle)]">
                      <th className="px-4 py-2 font-medium">Grade</th>
                      <th className="px-4 py-2 font-medium">Range</th>
                      <th className="px-4 py-2 font-medium">GPA</th>
                      <th className="px-4 py-2 font-medium">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.gradeScale.bands.map((band) => (
                      <tr key={band.grade} className="border-b border-[var(--line)] last:border-0">
                        <td className="px-4 py-2">
                          <Badge tone="brand">{band.grade}</Badge>
                        </td>
                        <td className="tabular px-4 py-2 text-[var(--ink)]">
                          {band.minPercent}–{band.maxPercent}%
                        </td>
                        <td className="tabular px-4 py-2 text-[var(--ink)]">{band.gpa ?? '—'}</td>
                        <td className="px-4 py-2 text-[var(--ink-muted)]">{band.remark ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      );
    }

    return null;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Academy-wide configuration. Each section is validated independently and merged into the stored rules."
        breadcrumbs={[{ label: 'System' }, { label: 'Settings' }]}
        actions={
          <>
            <Button variant="outline" onClick={revert} disabled={!dirty || pending}>
              <RotateCcw />
              Discard changes
            </Button>
            <Button onClick={save} loading={pending} disabled={!dirty}>
              <Save />
              Save changes
            </Button>
          </>
        }
      />

      {error && (
        <Alert tone="danger" title="Settings unavailable">
          {error}
        </Alert>
      )}

      {dirty && (
        <Alert tone="warning" title="Unsaved changes">
          You have unsaved changes in {titleCase(block)}. Save them before switching sections or
          they will be discarded.
        </Alert>
      )}

      <Tabs
        tabs={BLOCKS.map((b) => ({ value: b.value, label: b.label }))}
        value={block}
        onChange={(value) => setBlock(value as Block)}
      />

      {loading ? (
        <Card>
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        </Card>
      ) : (
        <>
          {renderBlock()}
          <SectionHeading
            title="How these settings are enforced"
            description="Saving writes to the Setting table inside a transaction and records an audit entry. Attendance, fee and grading services read the stored values on every calculation, so a change takes effect immediately for new operations — it never rewrites historical records."
          />
        </>
      )}
    </div>
  );
}
