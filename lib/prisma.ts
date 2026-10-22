import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
// The host CPU count can exceed the container's allocation. Bound each process's
// pool and share it across route bundles, including production.
const databaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (databaseUrl && !databaseUrl.searchParams.has("connection_limit")) databaseUrl.searchParams.set("connection_limit", "12");
export const prisma = globalForPrisma.prisma ?? new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl.toString() } } } : undefined);
globalForPrisma.prisma = prisma;
