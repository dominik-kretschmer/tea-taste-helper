// Aus dem Vorrat entfernen (06 AK-4.1)
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  await deletePantryEntry(usePrisma(), user.id, getUuidParam(event, pantryNotFound))
  setResponseStatus(event, 204)
  return null
})
