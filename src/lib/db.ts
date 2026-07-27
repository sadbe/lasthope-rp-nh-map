import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// In development, log all SQL queries for debugging.
// In production, only log errors — full query logging leaks data
// into stdout and is a (minor) info-disclosure risk.
const logConfig = process.env.NODE_ENV === 'production'
  ? ['error', 'warn']
  : ['query', 'error', 'warn']

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: logConfig as any,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
