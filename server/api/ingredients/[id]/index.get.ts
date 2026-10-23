export default defineEventHandler(async (event) => {
  const id = getIngredientIdParam(event)
  return { ingredient: await loadDetail(usePrisma(), id) }
})
