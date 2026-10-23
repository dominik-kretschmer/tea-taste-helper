import { createHash, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import type { User } from '../generated/prisma/client'

declare module 'h3' {
  interface H3EventContext {
    /** Angemeldeter Nutzer der Anfrage; nur unter /api/** aufgelöst (server/middleware/auth.ts). */
    user?: PublicUser | null
    /** DB-Schlüssel (Hash) der aktuellen Session */
    sessionId?: string
  }
}

const HOUR = 60 * 60 * 1000
export const SESSION_TTL_MS = 12 * HOUR // ohne „Angemeldet bleiben“ (AK-2.3)
export const REMEMBER_TTL_MS = 30 * 24 * HOUR // mit „Angemeldet bleiben“ (AK-2.4)
const TOUCH_INTERVAL_MS = 60 * 1000 // Verlängerung höchstens einmal pro Minute schreiben

const isProduction = () => useEnv().NODE_ENV === 'production'
// __Host- erzwingt Secure, Path=/ und keine Domain – nur mit HTTPS möglich
export const sessionCookieName = () => (isProduction() ? '__Host-session' : 'session')

/** Nur der Hash des Tokens landet in der DB (AK-2.6). */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  }
}

function setSessionCookie(event: H3Event, token: string, remember: boolean) {
  setCookie(event, sessionCookieName(), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    // Ohne maxAge ein Sitzungscookie, das mit dem Browser endet (AK-2.3)
    ...(remember ? { maxAge: REMEMBER_TTL_MS / 1000 } : {}),
  })
}

function clearSessionCookie(event: H3Event) {
  deleteCookie(event, sessionCookieName(), { path: '/', secure: isProduction(), sameSite: 'lax', httpOnly: true })
}

/** Legt eine neue Session an (immer neue ID, AK-2.6) und setzt das Cookie. */
export async function createSession(event: H3Event, user: User, remember: boolean): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const id = hashToken(token)
  await usePrisma().session.create({
    data: { id, userId: user.id, remember, expiresAt: new Date(Date.now() + (remember ? REMEMBER_TTL_MS : SESSION_TTL_MS)) },
  })
  setSessionCookie(event, token, remember)
  event.context.sessionId = id
  event.context.user = toPublicUser(user)
}

/**
 * Liest das Session-Cookie und liefert den Nutzer – oder null, wenn die Session fehlt,
 * abgelaufen ist oder der Nutzer gesperrt ist (AK-2.3, 2.4, 2.7; befristete Sperren laufen ab, 05 AK-6.3). Verlängert gleitend.
 */
export async function resolveSession(event: H3Event): Promise<PublicUser | null> {
  const token = getCookie(event, sessionCookieName())
  if (!token) return null

  const prisma = usePrisma()
  const id = hashToken(token)
  const session = await prisma.session.findUnique({ where: { id }, include: { user: true } })
  const now = Date.now()

  if (!session || session.expiresAt.getTime() <= now || isBlocked(session.user, new Date(now))) {
    if (session) await prisma.session.delete({ where: { id } }).catch(() => {})
    clearSessionCookie(event)
    return null
  }

  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    const ttl = session.remember ? REMEMBER_TTL_MS : SESSION_TTL_MS
    await prisma.session.update({ where: { id }, data: { lastSeenAt: new Date(now), expiresAt: new Date(now + ttl) } })
    if (session.remember) setSessionCookie(event, token, true)
  }

  event.context.sessionId = id
  return toPublicUser(session.user)
}

/** Beendet die aktuelle Session serverseitig und löscht das Cookie (AK-2.5). */
export async function destroySession(event: H3Event): Promise<void> {
  if (event.context.sessionId) {
    await usePrisma().session.deleteMany({ where: { id: event.context.sessionId } })
  }
  clearSessionCookie(event)
  event.context.sessionId = undefined
  event.context.user = null
}

/** Beendet alle Sessions eines Nutzers, optional außer einer (AK-3.1, AK-6.1). */
export async function destroyUserSessions(userId: string, options: { exceptSessionId?: string } = {}): Promise<void> {
  await usePrisma().session.deleteMany({
    where: { userId, ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}) },
  })
}

/** Löscht abgelaufene Sessions (Aufräum-Task). */
export async function purgeExpiredSessions(): Promise<number> {
  const { count } = await usePrisma().session.deleteMany({ where: { expiresAt: { lte: new Date() } } })
  return count
}
