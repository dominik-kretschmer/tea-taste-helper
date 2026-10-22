import { changePasswordSchema } from '#shared/schemas/auth'

const WINDOW_MS = 15 * 60 * 1000

export default defineEventHandler(async (event) => {
  const sessionUser = requireUser(event)
  // Begrenzt das Durchprobieren des aktuellen Passworts mit einer gekaperten Session
  assertRateLimit(event, consume(`password:user:${sessionUser.id}`, 5, WINDOW_MS))
  const input = await readValidatedBody(event, changePasswordSchema.parse)

  const prisma = usePrisma()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } })
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AppError(403, 'INVALID_CREDENTIALS', 'Current password is incorrect')
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false },
  })
  // Alle anderen Sessions beenden, die aktuelle bleibt (AK-3.1)
  await destroyUserSessions(user.id, { exceptSessionId: event.context.sessionId })
  await audit(event, { event: 'PASSWORD_CHANGED', actorId: user.id, targetId: user.id })

  setResponseStatus(event, 204)
  return null
})
