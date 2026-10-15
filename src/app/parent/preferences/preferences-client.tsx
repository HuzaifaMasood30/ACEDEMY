'use client';

import * as React from 'react';
import { CalendarX, CheckCircle2, Settings2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from '@/components/ui/structure';
import { Alert, Badge, Button, Field, Input, Select, Switch } from '@/components/ui/primitives';
import { api, list } from '@/lib/client-api';

interface Preference {
  id?: string;
  channel: string;
  category: string;
  enabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  language: string;
  optedOut: boolean;
  optedOutAt: string | null;
}

interface PreferencePayload {
  preferences: Preference[];
  channels: string[];
  categories: string[];
  defaults: { quietHoursStart: number; quietHoursEnd: number; language: string };
}

const CATEGORY_LABEL: Record<string, string> = {
  ATTENDANCE_ABSENCE: 'Absence alerts',
  FEE_REMINDER: 'Fee reminders',
  FEE_OVERDUE: 'Overdue fee notices',
  EXAM_REMINDER: 'Exam reminders',
  RESULT_PUBLISHED: 'Published results',
  TIMETABLE_CHANGE: 'Timetable changes',
  ASSIGNMENT_NEW: 'New assignments',
  ASSIGNMENT_DUE: 'Assignment deadlines',
  ANNOUNCEMENT: 'Announcements',
  ADMISSION_UPDATE: 'Admission updates',
  ACCOUNT: 'Account messages',
  MANUAL: 'Messages from staff',
};

const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  SMS: 'SMS',
  IN_APP: 'In-app',
};

/**
 * Notification preferences for the signed-in guardian or teacher.
 *
 * Only WhatsApp preferences are editable today because that is the only channel
 * the delivery worker implements; the others are listed as they become active.
 */
export function PreferencesClient() {
  const [payload, setPayload] = React.useState<PreferencePayload | null>(null);
  const [prefs, setPrefs] = React.useState<Preference[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getOne<PreferencePayload>('/api/notification-preferences');
      setPayload(result);
      setPrefs(result.preferences);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load preferences.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  /** Preferences are stored per channel+category; find or default one. */
  const findPref = (category: string): Preference =>
    prefs.find((entry) => entry.category === category && entry.channel === 'WHATSAPP') ?? {
      channel: 'WHATSAPP',
      category,
      enabled: true,
      quietHoursStart: null,
      quietHoursEnd: null,
      language: 'en',
      optedOut: false,
      optedOutAt: null,
    };

  const updatePref = (category: string, patch: Partial<Preference>) => {
    setPrefs((current) => {
      const index = current.findIndex(
        (entry) => entry.category === category && entry.channel === 'WHATSAPP',
      );
      const base = findPref(category);
      const next = { ...base, ...patch };
      if (index === -1) return [...current, next];
      const copy = [...current];
      copy[index] = next;
      return copy;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const whatsappPrefs = prefs
        .filter((entry) => entry.channel === 'WHATSAPP')
        .map((entry) => ({
          channel: entry.channel,
          category: entry.category,
          enabled: entry.enabled,
          quietHoursStart: entry.quietHoursStart,
          quietHoursEnd: entry.quietHoursEnd,
          language: entry.language,
        }));

      await api.put('/api/notification-preferences', { preferences: whatsappPrefs });
      toast.success('Preferences saved.');
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not save preferences.');
    } finally {
      setSaving(false);
    }
  };

  const categories = payload?.categories.filter((category) => category !== 'ACCOUNT') ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification preferences"
        description="Choose what the academy may send you and when."
        actions={
          <Button onClick={save} loading={saving} disabled={loading}>
            Save changes
          </Button>
        }
      />

      {error && <Alert tone="danger" title="Could not load preferences">{error}</Alert>}

      <Alert tone="info" title="WhatsApp is the active channel">
        Only WhatsApp notifications are delivered at present. Preferences for other channels are saved
        but not yet used.
      </Alert>

      <Card>
        <CardHeader
          title="WhatsApp notifications"
          description="Turn a category off to stop receiving those messages."
          icon={<Settings2 />}
        />
        {loading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="skeleton h-14 rounded-lg" />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<Settings2 />}
              title="No categories available"
              description="Notification categories will appear here once configured."
            />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {categories.map((category) => {
              const pref = findPref(category);
              return (
                <li key={category} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--ink)]">
                      {CATEGORY_LABEL[category] ?? category}
                    </p>
                    <p className="text-xs text-[var(--ink-muted)]">
                      {pref.optedOut
                        ? 'You have opted out of these messages.'
                        : pref.enabled
                          ? `Sent over ${CHANNEL_LABEL[pref.channel] ?? pref.channel}`
                          : 'Not sent'}
                    </p>
                  </div>
                  <Switch
                    checked={pref.enabled && !pref.optedOut}
                    onChange={(checked) => updatePref(category, { enabled: checked })}
                    
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Quiet hours"
          description="No WhatsApp message is delivered during these hours."
          icon={<CalendarX />}
        />
        <div className="grid gap-4 p-4 sm:grid-cols-3 sm:p-5">
          {categories.slice(0, 1).map((category) => {
            const pref = findPref(category);
            return (
              <React.Fragment key={category}>
                <Field label="From (hour)" htmlFor="qh-start">
                  <Select
                    id="qh-start"
                    value={pref.quietHoursStart ?? payload?.defaults.quietHoursStart ?? 21}
                    onChange={(event) =>
                      updatePref(category, { quietHoursStart: Number(event.target.value) })
                    }
                  >
                    {Array.from({ length: 24 }, (_, hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, '0')}:00
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="To (hour)" htmlFor="qh-end">
                  <Select
                    id="qh-end"
                    value={pref.quietHoursEnd ?? payload?.defaults.quietHoursEnd ?? 7}
                    onChange={(event) =>
                      updatePref(category, { quietHoursEnd: Number(event.target.value) })
                    }
                  >
                    {Array.from({ length: 24 }, (_, hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, '0')}:00
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Language" htmlFor="qh-lang">
                  <Select
                    id="qh-lang"
                    value={pref.language}
                    onChange={(event) => updatePref(category, { language: event.target.value })}
                  >
                    <option value="en">English</option>
                    <option value="ur">اردو (Urdu)</option>
                  </Select>
                </Field>
              </React.Fragment>
            );
          })}
        </div>
        <div className="border-t border-[var(--line)] p-4">
          <p className="text-xs text-[var(--ink-muted)]">
            Quiet hours apply to the WhatsApp channel. Urgent account messages are still shown in the
            portal.
          </p>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving} disabled={loading}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
