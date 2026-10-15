'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, SlidersHorizontal, Star, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, Field, Input, Select } from '@/components/ui/primitives';
import { Card, CardHeader, EmptyState, PageHeader, StatCard, TableWrap, Td, Th, Tr } from '@/components/ui/structure';
import { Modal } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation } from '@/lib/use-resource';
import { formatNumber } from '@/lib/format';

interface Band {
  id?: string;
  grade: string;
  minPercent: string;
  maxPercent: string;
  gpa: string;
  remark: string;
}

interface ScaleRow {
  id: string;
  name: string;
  isDefault: boolean;
  bands: Array<{
    id: string;
    grade: string;
    minPercent: string;
    maxPercent: string;
    gpa: string | null;
    remark: string | null;
  }>;
  _count: { examSubjects: number; examResults: number };
}

interface ActiveScale {
  id: string;
  name: string;
  bands: Array<{ grade: string; minPercent: number; maxPercent: number; gpa: number | null }>;
}

const DEFAULT_BANDS: Band[] = [
  { grade: 'A+', minPercent: '90', maxPercent: '100', gpa: '4.00', remark: 'Outstanding' },
  { grade: 'A', minPercent: '80', maxPercent: '89.99', gpa: '3.75', remark: 'Excellent' },
  { grade: 'B', minPercent: '70', maxPercent: '79.99', gpa: '3.00', remark: 'Good' },
  { grade: 'C', minPercent: '60', maxPercent: '69.99', gpa: '2.00', remark: 'Satisfactory' },
  { grade: 'D', minPercent: '50', maxPercent: '59.99', gpa: '1.00', remark: 'Pass' },
  { grade: 'F', minPercent: '0', maxPercent: '49.99', gpa: '0.00', remark: 'Fail' },
];

/** Detect overlapping bands, mirroring the server-side rule. */
function findOverlap(bands: Band[]): string | null {
  const parsed = bands
    .map((band) => ({
      grade: band.grade,
      min: Number(band.minPercent),
      max: Number(band.maxPercent),
    }))
    .filter((band) => Number.isFinite(band.min) && Number.isFinite(band.max));

  for (const band of parsed) {
    if (band.max < band.min) {
      return `Grade ${band.grade}: the maximum is below the minimum.`;
    }
  }

  const sorted = [...parsed].sort((a, b) => b.min - a.min);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].max >= sorted[i - 1].min) {
      return `Grades ${sorted[i].grade} and ${sorted[i - 1].grade} overlap.`;
    }
  }

  return null;
}

export function GradingClient() {
  const [scales, setScales] = React.useState<ScaleRow[]>([]);
  const [active, setActive] = React.useState<ActiveScale | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ScaleRow | null>(null);
  const [name, setName] = React.useState('');
  const [bands, setBands] = React.useState<Band[]>(DEFAULT_BANDS);
  const [isDefault, setIsDefault] = React.useState(false);

  const { run, pending } = useMutation();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getOne<{ scales: ScaleRow[]; active: ActiveScale | null }>(
        '/api/admin/grading',
      );
      setScales(data.scales);
      setActive(data.active);
      setError(null);
    } catch {
      setError('Could not load grading scales.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const overlap = findOverlap(bands);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setBands(DEFAULT_BANDS.map((band) => ({ ...band })));
    setIsDefault(scales.length === 0);
    setEditorOpen(true);
  };

  const openEdit = (scale: ScaleRow) => {
    setEditing(scale);
    setName(scale.name);
    setBands(
      scale.bands.map((band) => ({
        id: band.id,
        grade: band.grade,
        minPercent: String(band.minPercent),
        maxPercent: String(band.maxPercent),
        gpa: band.gpa ? String(band.gpa) : '',
        remark: band.remark ?? '',
      })),
    );
    setIsDefault(scale.isDefault);
    setEditorOpen(true);
  };

  const submit = async () => {
    if (overlap) return;

    const payloadBands = bands.map((band) => ({
      grade: band.grade.trim().toUpperCase(),
      minPercent: Number(band.minPercent),
      maxPercent: Number(band.maxPercent),
      gpa: band.gpa ? Number(band.gpa) : null,
      remark: band.remark.trim() || null,
    }));

    const result = editing
      ? await run(
          () =>
            api.put('/api/admin/grading', {
              action: 'replaceBands',
              gradeScaleId: editing.id,
              bands: payloadBands,
            }),
          { success: 'Grade bands updated.' },
        )
      : await run(
          () =>
            api.post('/api/admin/grading', {
              name: name.trim(),
              isDefault,
              bands: payloadBands,
            }),
          { success: 'Grading scale created.' },
        );

    if (result) {
      setEditorOpen(false);
      await load();
    }
  };

  const makeDefault = async (scaleId: string) => {
    const result = await run(
      () => api.put('/api/admin/grading', { action: 'setDefault', gradeScaleId: scaleId }),
      { success: 'Default scale updated.' },
    );
    if (result) await load();
  };

  const updateBand = (index: number, patch: Partial<Band>) =>
    setBands((prev) => prev.map((band, i) => (i === index ? { ...band, ...patch } : band)));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grading scales"
        description="How percentages convert into grades, grade points and remarks."
        breadcrumbs={[{ label: 'Academics' }, { label: 'Grading scales' }]}
        actions={
          <Button onClick={openCreate}>
            <Plus />
            New scale
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Scales" value={formatNumber(scales.length)} icon={<SlidersHorizontal />} tone="brand" />
        <StatCard
          label="Active scale"
          value={active?.name ?? 'None'}
          icon={<Star />}
          tone={active ? 'success' : 'danger'}
          hint={active ? `${active.bands.length} bands` : 'Results cannot be graded without one'}
        />
        <StatCard
          label="Subjects using a scale"
          value={formatNumber(scales.reduce((sum, s) => sum + s._count.examSubjects, 0))}
          icon={<CheckCircle2 />}
          tone="info"
        />
        <StatCard
          label="Graded results"
          value={formatNumber(scales.reduce((sum, s) => sum + s._count.examResults, 0))}
          icon={<AlertTriangle />}
          tone="accent"
          hint="Results already computed against a scale"
        />
      </div>

      {error && (
        <Alert tone="danger" title="Could not load grading">
          {error}
        </Alert>
      )}

      {!active && !loading && (
        <Alert tone="warning" title="No default grading scale">
          Mark one scale as the default. Examination results cannot be graded until a default scale
          exists.
        </Alert>
      )}

      {loading ? (
        <Card>
          <div className="py-12 text-center text-sm text-[var(--ink-muted)]">Loading…</div>
        </Card>
      ) : scales.length === 0 ? (
        <Card>
          <EmptyState
            icon={<SlidersHorizontal />}
            title="No grading scales"
            description="Create a scale such as A+ to F with percentage boundaries and grade points."
            className="border-0"
            action={
              <Button onClick={openCreate}>
                <Plus />
                New scale
              </Button>
            }
          />
        </Card>
      ) : (
        scales.map((scale) => (
          <Card key={scale.id}>
            <CardHeader
              title={scale.name}
              description={`${scale.bands.length} grade bands · ${scale._count.examSubjects} subject(s) · ${scale._count.examResults} graded result(s)`}
              icon={<SlidersHorizontal />}
              action={
                <div className="flex items-center gap-2">
                  {scale.isDefault ? (
                    <Badge tone="success">
                      <Star className="size-3" />
                      Default
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => makeDefault(scale.id)}
                      loading={pending}
                    >
                      Make default
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => openEdit(scale)}>
                    Edit bands
                  </Button>
                </div>
              }
            />

            <TableWrap>
              <thead>
                <tr>
                  <Th>Grade</Th>
                  <Th align="right">From</Th>
                  <Th align="right">To</Th>
                  <Th align="right">Grade point</Th>
                  <Th>Remark</Th>
                </tr>
              </thead>
              <tbody>
                {scale.bands.map((band) => (
                  <Tr key={band.id}>
                    <Td>
                      <Badge tone="brand">{band.grade}</Badge>
                    </Td>
                    <Td align="right" className="tabular text-sm">
                      {Number(band.minPercent)}%
                    </Td>
                    <Td align="right" className="tabular text-sm">
                      {Number(band.maxPercent)}%
                    </Td>
                    <Td align="right" className="tabular text-sm text-[var(--ink-muted)]">
                      {band.gpa ? Number(band.gpa).toFixed(2) : '—'}
                    </Td>
                    <Td className="text-xs text-[var(--ink-muted)]">{band.remark ?? '—'}</Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>
        ))
      )}

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New grading scale'}
        description="Bands must not overlap. Every percentage from 0 to 100 should match exactly one grade."
        size="lg"
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending} disabled={Boolean(overlap) || bands.length === 0}>
              {editing ? 'Save bands' : 'Create scale'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {!editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Scale name" htmlFor="scale-name" required>
                <Input
                  id="scale-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Standard Percentage"
                />
              </Field>

              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="size-4 accent-[var(--brand)]"
                  />
                  Use as the default scale
                </label>
              </div>
            </div>
          )}

          {overlap && (
            <Alert tone="danger" title="The grade bands overlap">
              {overlap} Adjust the boundaries so each percentage matches one grade only.
            </Alert>
          )}

          <div className="space-y-2">
            {bands.map((band, index) => (
              <div
                key={index}
                className="grid grid-cols-2 items-end gap-2 rounded-lg border border-[var(--line)] p-3 sm:grid-cols-12"
              >
                <Field label="Grade" htmlFor={`band-grade-${index}`} className="sm:col-span-2">
                  <Input
                    id={`band-grade-${index}`}
                    value={band.grade}
                    onChange={(e) => updateBand(index, { grade: e.target.value.toUpperCase() })}
                  />
                </Field>

                <Field label="From %" htmlFor={`band-min-${index}`} className="sm:col-span-2">
                  <Input
                    id={`band-min-${index}`}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={band.minPercent}
                    onChange={(e) => updateBand(index, { minPercent: e.target.value })}
                  />
                </Field>

                <Field label="To %" htmlFor={`band-max-${index}`} className="sm:col-span-2">
                  <Input
                    id={`band-max-${index}`}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={band.maxPercent}
                    onChange={(e) => updateBand(index, { maxPercent: e.target.value })}
                  />
                </Field>

                <Field label="Points" htmlFor={`band-gpa-${index}`} className="sm:col-span-2">
                  <Input
                    id={`band-gpa-${index}`}
                    type="number"
                    min="0"
                    max="10"
                    step="0.01"
                    value={band.gpa}
                    onChange={(e) => updateBand(index, { gpa: e.target.value })}
                  />
                </Field>

                <Field label="Remark" htmlFor={`band-remark-${index}`} className="col-span-2 sm:col-span-3">
                  <Input
                    id={`band-remark-${index}`}
                    value={band.remark}
                    onChange={(e) => updateBand(index, { remark: e.target.value })}
                  />
                </Field>

                <div className="flex justify-end sm:col-span-1">
                  <Button
                    variant="ghost"
                    size="iconSm"
                    aria-label={`Remove grade ${band.grade || index + 1}`}
                    disabled={bands.length <= 1}
                    onClick={() => setBands((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setBands((prev) => [
                ...prev,
                { grade: '', minPercent: '0', maxPercent: '0', gpa: '', remark: '' },
              ])
            }
          >
            <Plus />
            Add band
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export { Select };
