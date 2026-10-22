import { loginSchema } from '#shared/schemas/auth'

const WINDOW_MS = 15 * 60 * 1000
const IP_LIMIT = 10
const EMAIL_FAILURE_LIMIT = 5

export default defineEventHandler(async (event) => {
  assertRateLimit(event, consume(`login:ip:${getClientIp(event)}`, IP_LIMIT, WINDOW_MS))
  const input = await readValidatedBody(event, loginSchema.parse)

  // Pro E-Mail zählen nur Fehlversuche, gesperrt wird aber vor der Passwortprüfung (AK-8.1)
  const emailKey = `login:email:${input.email}`
  assertRateLimit(event, check(emailKey, EMAIL_FAILURE_LIMIT))

  const prisma = usePrisma()
  const user = await prisma.user.findUnique({ where: { email: input.email } })
  const valid = user ? await verifyPassword(user.passwordHash, input.password) : await verifyDummy(input.password)

  if (!user || !valid) {
    consume(emailKey, EMAIL_FAILURE_LIMIT, WINDOW_MS)
    await audit(event, { event: 'LOGIN_FAILED', targetId: user?.id, details: { email: input.email } })
    // Gleiche Meldung für unbekannte E-Mail und falsches Passwort (AK-2.2)
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
  }

  if (user.blockedAt) {
    await audit(event, { event: 'LOGIN_FAILED', targetId: user.id, details: { email: input.email, reason: 'blocked' } })
    throw new AppError(403, 'ACCOUNT_BLOCKED', 'This account is blocked')
  }

  reset(emailKey)
  // Eine bereits bestehende Session dieses Browsers nicht weiterverwenden
  if (event.context.sessionId) await destroySession(event)

  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await createSession(event, updated, input.remember)
  await audit(event, { event: 'LOGIN_SUCCEEDED', actorId: user.id, targetId: user.id })

  return { user: toPublicUser(updated) }
})
