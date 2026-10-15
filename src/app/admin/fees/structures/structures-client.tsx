'use client';

import * as React from 'react';
import { BadgeDollarSign, Layers, Pencil, Plus, RefreshCw, Trash2, Wallet } from 'lucide-react';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Card, CardHeader, EmptyState, PageHeader, StatCard, TableWrap, Td, Th, Tr } from '@/components/ui/structure';
import { Modal, ConfirmDialog } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation } from '@/lib/use-resource';
import { formatMoney, formatNumber, titleCase } from '@/lib/format';

interface Item {
  id?: string;
  head: string;
  description: string;
  amount: string;
  isOptional: boolean;
  frequency: string;
  dueDayOfMonth: string;
}

interface StructureRow {
  id: string;
  name: string;
  frequency: string;
  isActive: boolean;
  classSectionId: string | null;
  courseId: string | null;
  course: { id: string; name: string } | null;
  academicSession: { id: string; name: string } | null;
  className: string | null;
  items: Array<{
    id: string;
    head: string;
    description: string | null;
    amount: string;
    isOptional: boolean;
    frequency: string;
    dueDayOfMonth: number | null;
  }>;
  total: number;
  recurringTotal: number;
}

interface Options {
  courses: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; name: string }>;
  sessions: Array<{ id: string; name: string; isCurrent: boolean }>;
}

const FREQUENCIES = [
  'ONE_TIME',
  'MONTHLY',
  'QUARTERLY',
  'TERM',
  'HALF_YEARLY',
  'ANNUAL',
] as const;

const EMPTY_ITEM: Item = {
  head: '',
  description: '',
  amount: '',
  isOptional: false,
  frequency: 'MONTHLY',
  dueDayOfMonth: '',
};

export function FeeStructuresClient() {
  const [structures, setStructures] = React.useState<StructureRow[]>([]);
  const [options, setOptions] = React.useState<Options | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<StructureRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<StructureRow | null>(null);
  const [form, setForm] = React.useState({
    name: '',
    frequency: 'MONTHLY',
    courseId: '',
    classSectionId: '',
    academicSessionId: '',
    items: [{ ...EMPTY_ITEM }] as Item[],
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const { run, pending } = useMutation();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getOne<{ structures: StructureRow[]; options: Options }>(
        '/api/admin/fees/structures',
      );
      setStructures(data.structures);
      setOptions(data.options);
      setError(null);
    } catch {
      setError('Could not load fee structures.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    const current = options?.sessions.find((s) => s.isCurrent);
    setForm({
      name: '',
      frequency: 'MONTHLY',
      courseId: '',
      classSectionId: '',
      academicSessionId: current?.id ?? '',
      items: [{ ...EMPTY_ITEM }],
    });
    setErrors({});
    setEditorOpen(true);
  };

  const openEdit = async (structure: StructureRow) => {
    setEditing(structure);
    setForm({
      name: structure.name,
      frequency: structure.frequency,
      courseId: structure.courseId ?? '',
      classSectionId: structure.classSectionId ?? '',
      academicSessionId: structure.academicSession?.id ?? '',
      items: structure.items.map((item) => ({
        id: item.id,
        head: item.head,
        description: item.description ?? '',
        amount: String(Number(item.amount)),
        isOptional: item.isOptional,
        frequency: item.frequency,
        dueDayOfMonth: item.dueDayOfMonth ? String(item.dueDayOfMonth) : '',
      })),
    });
    setErrors({});
    setEditorOpen(true);
  };

  const payloadItems = () =>
    form.items
      .filter((item) => item.head.trim() && item.amount !== '')
      .map((item) => ({
        head: item.head.trim(),
        description: item.description.trim() || null,
        amount: Number(item.amount),
        isOptional: item.isOptional,
        frequency: item.frequency,
        dueDayOfMonth: item.dueDayOfMonth ? Number(item.dueDayOfMonth) : null,
      }));

  const submit = async () => {
    setErrors({});
    const items = payloadItems();

    if (items.length === 0) {
      setErrors({ items: 'Add at least one charge with a head and an amount.' });
      return;
    }

    if (editing) {
      const renamed =
        form.name.trim() !== editing.name || form.frequency !== editing.frequency;
      if (renamed) {
        const result = await run(
          () =>
            api.put('/api/admin/fees/structures', {
              action: 'update',
              structureId: editing.id,
              name: form.name.trim(),
              frequency: form.frequency,
            }),
          { success: 'Fee structure updated.' },
        );
        if (!result) return;
      }

      const result = await run(
        () =>
          api.put('/api/admin/fees/structures', {
            action: 'replaceItems',
            structureId: editing.id,
            items,
          }),
        { success: 'Charges replaced.' },
      );
      if (result) {
        setEditorOpen(false);
        await load();
      }
      return;
    }

    const result = await run(
      () =>
        api.post('/api/admin/fees/structures', {
          name: form.name.trim(),
          frequency: form.frequency,
          courseId: form.courseId || null,
          classSectionId: form.classSectionId || null,
          academicSessionId: form.academicSessionId || null,
          items,
        }),
      { success: 'Fee structure created.' },
    );

    if (result) {
      setEditorOpen(false);
      await load();
    }
  };

  const toggleActive = async (structure: StructureRow) => {
    const result = await run(
      () =>
        api.put('/api/admin/fees/structures', {
          action: 'update',
          structureId: structure.id,
          isActive: !structure.isActive,
        }),
      { success: structure.isActive ? 'Structure deactivated.' : 'Structure reactivated.' },
    );
    if (result) await load();
  };

  const remove = async () => {
    if (!deleteTarget) return;
    const result = await run(
      () =>
        api.put('/api/admin/fees/structures', {
          action: 'delete',
          structureId: deleteTarget.id,
        }),
      { success: 'Fee structure deleted.' },
    );
    if (result) {
      setDeleteTarget(null);
      await load();
    }
  };

  const draftTotal = payloadItems().reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee structures"
        description="Templates that decide what a class or course is charged. Invoices keep their own copy."
        breadcrumbs={[{ label: 'Finance' }, { label: 'Fee structures' }]}
        actions={
          <>
            <Button variant="outline" onClick={load} loading={loading}>
              <RefreshCw />
              Refresh
            </Button>
            <Button onClick={openCreate}>
              <Plus />
              New structure
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Structures" value={formatNumber(structures.length)} icon={<Layers />} tone="brand" />
        <StatCard
          label="Active"
          value={formatNumber(structures.filter((s) => s.isActive).length)}
          icon={<BadgeDollarSign />}
          tone="success"
        />
        <StatCard
          label="Charge heads"
          value={formatNumber(structures.reduce((sum, s) => sum + s.items.length, 0))}
          icon={<Wallet />}
          tone="info"
        />
        <StatCard
          label="Highest recurring total"
          value={
            structures.length === 0
              ? '—'
              : formatMoney(Math.max(...structures.map((s) => s.recurringTotal)))
          }
          icon={<Pencil />}
          tone="accent"
          hint="Per billing period"
        />
      </div>

      {error && (
        <Alert tone="danger" title="Could not load fee structures">
          {error}
        </Alert>
      )}

      {loading ? (
        <Card>
          <div className="py-12 text-center text-sm text-[var(--ink-muted)]">Loading…</div>
        </Card>
      ) : structures.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Layers />}
            title="No fee structures"
            description="Create a structure such as Tuition plus Exam Fee, then generate invoices for a whole class."
            className="border-0"
            action={
              <Button onClick={openCreate}>
                <Plus />
                New structure
              </Button>
            }
          />
        </Card>
      ) : (
        structures.map((structure) => (
          <Card key={structure.id}>
            <CardHeader
              title={structure.name}
              description={[
                titleCase(structure.frequency),
                structure.className ? `Class: ${structure.className}` : null,
                structure.course ? `Course: ${structure.course.name}` : null,
                structure.academicSession?.name ?? null,
              ]
                .filter(Boolean)
                .join(' · ')}
              icon={<Layers />}
              action={
                <div className="flex items-center gap-2">
                  <Badge tone={structure.isActive ? 'success' : 'neutral'}>
                    {structure.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => openEdit(structure)}>
                    Edit charges
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleActive(structure)}
                    loading={pending}
                  >
                    {structure.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(structure)}>
                    <Trash2 />
                  </Button>
                </div>
              }
            />

            <TableWrap>
              <thead>
                <tr>
                  <Th>Charge</Th>
                  <Th>Description</Th>
                  <Th>Frequency</Th>
                  <Th align="right">Due day</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Type</Th>
                </tr>
              </thead>
              <tbody>
                {structure.items.map((item) => (
                  <Tr key={item.id}>
                    <Td className="text-sm font-medium text-[var(--ink)]">{item.head}</Td>
                    <Td className="max-w-[16rem] truncate text-xs text-[var(--ink-muted)]">
                      {item.description ?? '—'}
                    </Td>
                    <Td className="text-xs text-[var(--ink-muted)]">
                      {titleCase(item.frequency)}
                    </Td>
                    <Td align="right" className="tabular text-xs text-[var(--ink-muted)]">
                      {item.dueDayOfMonth ?? '—'}
                    </Td>
                    <Td align="right" className="tabular text-sm font-medium">
                      {formatMoney(Number(item.amount))}
                    </Td>
                    <Td align="right">
                      {item.isOptional ? (
                        <Badge tone="neutral">Optional</Badge>
                      ) : (
                        <Badge tone="brand">Required</Badge>
                      )}
                    </Td>
                  </Tr>
                ))}
                <Tr>
                  <Td className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                    Total
                  </Td>
                  <Td />
                  <Td />
                  <Td />
                  <Td align="right" className="tabular text-sm font-semibold text-[var(--ink)]">
                    {formatMoney(structure.total)}
                  </Td>
                  <Td />
                </Tr>
              </tbody>
            </TableWrap>
          </Card>
        ))
      )}

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New fee structure'}
        description={
          editing
            ? 'Replacing the charges does not change invoices that were already issued.'
            : 'Decide which class or course this applies to, then list the charges.'
        }
        size="xl"
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending}>
              {editing ? 'Save charges' : 'Create structure'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Structure name" htmlFor="fs-name" required error={errors.name}>
              <Input
                id="fs-name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Grade 9 Monthly Fee"
              />
            </Field>

            <Field label="Billing frequency" htmlFor="fs-frequency" required>
              <Select
                id="fs-frequency"
                value={form.frequency}
                onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value }))}
              >
                {FREQUENCIES.map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {titleCase(frequency)}
                  </option>
                ))}
              </Select>
            </Field>

            {!editing && (
              <>
                <Field label="Applies to a class" htmlFor="fs-class">
                  <Select
                    id="fs-class"
                    value={form.classSectionId}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, classSectionId: e.target.value, courseId: '' }))
                    }
                  >
                    <option value="">No specific class</option>
                    {options?.classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  label="Or applies to a course"
                  htmlFor="fs-course"
                  hint="A structure cannot target both."
                >
                  <Select
                    id="fs-course"
                    value={form.courseId}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, courseId: e.target.value, classSectionId: '' }))
                    }
                  >
                    <option value="">No specific course</option>
                    {options?.courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Academic session" htmlFor="fs-session">
                  <Select
                    id="fs-session"
                    value={form.academicSessionId}
                    onChange={(e) => setForm((p) => ({ ...p, academicSessionId: e.target.value }))}
                  >
                    <option value="">All sessions</option>
                    {options?.sessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}
          </div>

          {errors.items && (
            <Alert tone="danger" title="Charges incomplete">
              {errors.items}
            </Alert>
          )}

          <div className="space-y-2">
            {form.items.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-2 items-end gap-2 rounded-lg border border-[var(--line)] p-3 sm:grid-cols-12"
              >
                <Field label="Charge head" htmlFor={`item-head-${index}`} className="col-span-2 sm:col-span-3">
                  <Input
                    id={`item-head-${index}`}
                    value={item.head}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        items: p.items.map((it, i) =>
                          i === index ? { ...it, head: e.target.value } : it,
                        ),
                      }))
                    }
                    placeholder="e.g. Tuition Fee"
                  />
                </Field>

                <Field label="Amount" htmlFor={`item-amount-${index}`} className="sm:col-span-2">
                  <Input
                    id={`item-amount-${index}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.amount}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        items: p.items.map((it, i) =>
                          i === index ? { ...it, amount: e.target.value } : it,
                        ),
                      }))
                    }
                  />
                </Field>

                <Field label="Frequency" htmlFor={`item-freq-${index}`} className="sm:col-span-2">
                  <Select
                    id={`item-freq-${index}`}
                    value={item.frequency}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        items: p.items.map((it, i) =>
                          i === index ? { ...it, frequency: e.target.value } : it,
                        ),
                      }))
                    }
                  >
                    {FREQUENCIES.map((frequency) => (
                      <option key={frequency} value={frequency}>
                        {titleCase(frequency)}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Due day" htmlFor={`item-due-${index}`} className="sm:col-span-2">
                  <Input
                    id={`item-due-${index}`}
                    type="number"
                    min="1"
                    max="31"
                    value={item.dueDayOfMonth}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        items: p.items.map((it, i) =>
                          i === index ? { ...it, dueDayOfMonth: e.target.value } : it,
                        ),
                      }))
                    }
                    placeholder="5"
                  />
                </Field>

                <div className="flex items-center gap-2 pb-1 sm:col-span-2">
                  <label className="flex items-center gap-1.5 text-xs text-[var(--ink)]">
                    <input
                      type="checkbox"
                      checked={item.isOptional}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          items: p.items.map((it, i) =>
                            i === index ? { ...it, isOptional: e.target.checked } : it,
                          ),
                        }))
                      }
                      className="size-3.5 accent-[var(--brand)]"
                    />
                    Optional
                  </label>
                </div>

                <div className="flex justify-end sm:col-span-1">
                  <Button
                    variant="ghost"
                    size="iconSm"
                    aria-label={`Remove charge ${index + 1}`}
                    disabled={form.items.length <= 1}
                    onClick={() =>
                      setForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== index) }))
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>

                <Field
                  label="Description"
                  htmlFor={`item-desc-${index}`}
                  className="col-span-2 sm:col-span-12"
                >
                  <Textarea
                    id={`item-desc-${index}`}
                    rows={1}
                    value={item.description}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        items: p.items.map((it, i) =>
                          i === index ? { ...it, description: e.target.value } : it,
                        ),
                      }))
                    }
                  />
                </Field>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setForm((p) => ({ ...p, items: [...p.items, { ...EMPTY_ITEM }] }))}
            >
              <Plus />
              Add charge
            </Button>
            <p className="text-sm text-[var(--ink-muted)]">
              Draft total: <span className="tabular font-semibold">{formatMoney(draftTotal)}</span>
            </p>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        loading={pending}
        title="Delete this fee structure?"
        message={
          deleteTarget
            ? `${deleteTarget.name} will be removed. This is blocked when invoices already exist for its class, so financial history stays intact.`
            : ''
        }
        confirmLabel="Delete"
      />
    </div>
  );
}
