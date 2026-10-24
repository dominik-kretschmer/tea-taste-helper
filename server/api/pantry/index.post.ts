import { createPantrySchema } from '#shared/schemas/pantry'

// In den Vorrat aufnehmen, auch „Rückgängig“ nach dem Entfernen (06 AK-2.1–2.6, AK-4.1); ohne Audit (AK-3.3)
export default defineEventHandler(async (event): Promise<{ entry: PantryRef }> => {
  const user = requireUser(event)
  const input = await readValidatedBody(event, createPantrySchema.parse)
  const entry = await usePrisma().$transaction(tx => createPantryEntry(tx, user.id, input))
  setResponseStatus(event, 201)
  return { entry }
})
