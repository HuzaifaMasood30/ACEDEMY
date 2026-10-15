'use client';

import * as React from 'react';
import { GraduationCap, Users } from 'lucide-react';
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@/components/ui/structure';
import { Alert, Badge } from '@/components/ui/primitives';
import { usePortalContext } from '@/components/portal/portal-context';
import { api } from '@/lib/client-api';

interface AttendanceSummary {
  percentage: number;
  present: number;
  total: number;
  absent: number;
  rules?: { minimumPercentage: number };
}

/** The children linked to this guardian, with the permissions of each link. */
export function ChildrenClient() {
  const context = usePortalContext();

  return (
    <div className="space-y-6">
      <PageHeader
        title="My children"
        description="The students linked to this guardian account."
      />

      {context.error && <Alert tone="danger" title="Could not load children">{context.error}</Alert>}

      {context.loading ? (
        <div className="space-y-3">
          {[0, 1].map((index) => (
            <div key={index} className="skeleton h-32 rounded-xl" />
          ))}
        </div>
      ) : context.students.length === 0 ? (
        <Card>
          <div className="p-5">
            <EmptyState
              icon={<Users />}
              title="No children linked"
              description="Contact the academy office to link a student to this account."
            />
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Linked students"
            description="Permissions are set by the academy for each link."
            icon={<GraduationCap />}
          />
          <TableWrap>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th hideBelow="md">Admission no.</Th>
                <Th hideBelow="md">Class</Th>
                <Th>Relation</Th>
                <Th hideBelow="lg">Can view</Th>
              </tr>
            </thead>
            <tbody>
              {context.students.map((child) => (
                <Tr key={child.id}>
                  <Td>
                    <span className="text-sm font-medium text-[var(--ink)]">
                      {child.firstName} {child.lastName}
                    </span>
                    {child.link?.isPrimary && (
                      <span className="ml-2 text-xs text-[var(--brand-soft-ink)]">primary</span>
                    )}
                  </Td>
                  <Td hideBelow="md">
                    <span className="tabular text-sm text-[var(--ink-muted)]">
                      {child.admissionNo}
                    </span>
                  </Td>
                  <Td hideBelow="md">{child.enrollments[0]?.classSection.name ?? '—'}</Td>
                  <Td>
                    <Badge tone="brand">
                      {child.link?.relation.toLowerCase() ?? 'guardian'}
                    </Badge>
                  </Td>
                  <Td hideBelow="lg">
                    <div className="flex flex-wrap gap-1">
                      {child.link?.canViewResults !== false && <Badge tone="info">results</Badge>}
                      {child.link?.canViewFees !== false && <Badge tone="info">fees</Badge>}
                      {child.link?.canViewFees === false && child.link?.canViewResults === false && (
                        <span className="text-xs text-[var(--ink-subtle)]">Attendance only</span>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}
