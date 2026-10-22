export default defineEventHandler(async (event) => {
  const admin = requireRole(event, 'admin')
  const id = getUserIdParam(event)

  const prisma = usePrisma()
  if (!(await prisma.user.findUnique({ where: { id }, select: { id: true } }))) {
    throw new AppError(404, 'NOT_FOUND', 'User not found')
  }

  const temporaryPassword = generateTemporaryPassword()
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true },
  })
  await destroyUserSessions(id)
  // Das Einmal-Passwort selbst wird weder geloggt noch auditiert (AK-6.3)
  await audit(event, { event: 'PASSWORD_RESET_BY_ADMIN', actorId: admin.id, targetId: id })

  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { temporaryPassword }
})
