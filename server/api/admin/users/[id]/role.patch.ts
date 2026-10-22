import { changeRoleSchema } from '#shared/schemas/auth'

export default defineEventHandler(async (event) => {
  const admin = requireRole(event, 'admin')
  const id = getUserIdParam(event)
  const { role } = await readValidatedBody(event, changeRoleSchema.parse)

  if (id === admin.id) {
    throw new AppError(409, 'SELF_ROLE_CHANGE', 'You cannot change your own role')
  }

  // Serialisierbar, damit zwei gleichzeitige Herabstufungen nicht den letzten Admin entfernen (AK-5.3)
  const { user, from } = await usePrisma().$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id } })
    if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found')
    if (target.role === role) return { user: target, from: target.role }

    if (target.role === 'admin' && (await tx.user.count({ where: { role: 'admin' } })) <= 1) {
      throw new AppError(409, 'LAST_ADMIN', 'The last admin cannot be demoted')
    }
    return { user: await tx.user.update({ where: { id }, data: { role } }), from: target.role }
  }, { isolationLevel: 'Serializable' })

  if (from !== role) {
    await audit(event, { event: 'ROLE_CHANGED', actorId: admin.id, targetId: id, details: { from, to: role } })
  }
  return { user: toAdminUser(user) }
})
