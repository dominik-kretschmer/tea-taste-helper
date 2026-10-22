import { registerSchema } from '#shared/schemas/auth'

const HOUR = 60 * 60 * 1000

export default defineEventHandler(async (event) => {
  assertRateLimit(event, consume(`register:ip:${getClientIp(event)}`, 5, HOUR))
  const input = await readValidatedBody(event, registerSchema.parse)

  const adminEmail = useEnv().ADMIN_EMAIL
  const role = adminEmail && input.email === adminEmail ? 'admin' : 'user'
  // Auch bei vergebener E-Mail hashen, damit die Antwortzeit nichts verrät
  const passwordHash = await hashPassword(input.password)

  let user
  try {
    user = await usePrisma().user.create({
      data: { email: input.email, displayName: input.displayName, passwordHash, role },
    })
  }
  catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      // Allgemeine Meldung; Durchprobieren begrenzt das Rate-Limit (AK-1.2)
      throw new AppError(409, 'REGISTRATION_FAILED', 'Registration is not possible with these details')
    }
    throw error
  }

  await audit(event, { event: 'USER_REGISTERED', actorId: user.id, targetId: user.id })
  if (role === 'admin') {
    await audit(event, { event: 'ADMIN_BOOTSTRAPPED', targetId: user.id, details: { via: 'registration' } })
  }

  await createSession(event, user, input.remember)
  setResponseStatus(event, 201)
  return { user: toPublicUser(user) }
})
