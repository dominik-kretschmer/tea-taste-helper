export default defineEventHandler(async (event) => {
  const id = getTeaIdParam(event)
  return { tea: await loadTeaDetail(usePrisma(), id, event.context.user) }
})
