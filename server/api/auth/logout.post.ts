export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  await audit(event, { event: 'LOGOUT', actorId: user.id, targetId: user.id })
  await destroySession(event)
  setResponseStatus(event, 204)
  return null
})
