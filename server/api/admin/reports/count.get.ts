// Anzahl der Einträge mit offenen Meldungen, für das Badge (05 AK-3.5)
export default defineEventHandler(async (event) => {
  requireRole(event, 'moderator')
  const [{ open } = { open: 0 }] = await usePrisma().$queryRaw<{ open: number }[]>`
    SELECT count(DISTINCT ("entityType", "entityId"))::int AS open FROM "Report" WHERE status = 'open'`
  return { open }
})
