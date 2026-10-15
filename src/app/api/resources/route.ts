import { NextResponse } from 'next/server';
import { fail, guard, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { listResources } from '@/server/services/assignments';

/**
 * Learning resources.
 *
 * The same service the admin screens use, but every read is filtered to the
 * classes the signed-in actor belongs to. Academy-wide and public resources
 * remain visible to everyone.
 */
export async function GET(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.RESOURCE_VIEW);
    const query = parseListQuery(request);

    const { rows, total } = await listResources(actor, {
      classSectionId: query.params.get('classSectionId') ?? undefined,
      subjectId: query.params.get('subjectId') ?? undefined,
      category: query.params.get('category') ?? undefined,
      skip: query.skip,
      take: query.take,
    });

    return listResponse(rows, total, query);
  } catch (error) {
    return fail(error, 'resources GET');
  }
}
