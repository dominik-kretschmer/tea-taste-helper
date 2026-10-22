import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

// Auf globalThis gecacht, damit Hot Reload im Dev-Server keine neuen Verbindungspools öffnet (AK-2.2).
const globalForPrisma = globalThis as typeof globalThis & { __prisma?: PrismaClient }

/** Gemeinsame Prisma-Instanz für den gesamten Server. */
export function usePrisma(): PrismaClient {
  globalForPrisma.__prisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: useEnv().DATABASE_URL }),
  })
  return globalForPrisma.__prisma
}
