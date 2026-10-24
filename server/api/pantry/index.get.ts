import { pantryListQuerySchema } from '#shared/schemas/pantry'

// Eigener Vorrat, eine Art je Seite (06 AK-1.1–1.5)
export default defineEventHandler(async (event): Promise<PantryPage> => {
  const user = requireUser(event)
  const query = await getValidatedQuery(event, pantryListQuerySchema.parse)
  return listPantry(usePrisma(), user.id, query)
})
