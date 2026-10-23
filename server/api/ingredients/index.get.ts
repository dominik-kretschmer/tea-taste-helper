import { ingredientListQuerySchema } from '#shared/schemas/ingredient'

export default defineEventHandler(async (event): Promise<Page<IngredientListItem>> => {
  const query = await getValidatedQuery(event, ingredientListQuerySchema.parse)
  return listIngredients(usePrisma(), query)
})
