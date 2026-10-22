export default defineEventHandler(async (event) => {
  const { status, body, errors } = await checkHealth({
    db: () => usePrisma().$queryRaw`SELECT 1`,
    ollama: async () => {
      const response = await fetch(new URL('/api/version', useEnv().OLLAMA_URL))
      if (!response.ok) throw new Error(`Ollama antwortet mit ${response.status}`)
    },
  })

  for (const [service, err] of Object.entries(errors)) {
    event.context.log.warn({ service, err }, 'health check failed')
  }

  setResponseStatus(event, status)
  return body
})
