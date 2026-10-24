import { updatePantrySchema } from '#shared/schemas/pantry'

// Menge ändern, leeren oder auf 0 setzen (06 AK-3.1, AK-3.2)
export default defineEventHandler(async (event): Promise<{ entry: PantryRef }> => {
  const user = requireUser(event)
  const id = getUuidParam(event, pantryNotFound)
  const { grams } = await readValidatedBody(event, updatePantrySchema.parse)
  return { entry: await updatePantryEntry(usePrisma(), user.id, id, grams) }
})
