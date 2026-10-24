import { pantryLookupQuerySchema } from '#shared/schemas/pantry'

// Eintrag zu einer Zutat bzw. einem Tee für die Detailseiten (06 AK-2.2)
export default defineEventHandler(async (event): Promise<{ entry: PantryRef | null }> => {
  const user = requireUser(event)
  const { type, entityId } = await getValidatedQuery(event, pantryLookupQuerySchema.parse)
  return { entry: await findPantryEntry(usePrisma(), user.id, type, entityId) }
})
