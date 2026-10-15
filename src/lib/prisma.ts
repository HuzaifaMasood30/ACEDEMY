import { PrismaClient } from '@prisma/client';
import { isProduction } from './env';

/**
 * Next.js hot-reloads modules in development; without the global cache each
 * reload would open a new pool until Postgres refuses connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  return new PrismaClient({
    log: isProduction ? ['error'] : ['error', 'warn'],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}
