// Bricht den Serverstart ab, wenn die Umgebung unvollständig oder ungültig ist (AK-3.2).
export default defineNitroPlugin(() => {
  let env: ReturnType<typeof useEnv>
  try {
    env = useEnv()
  }
  catch (error) {
    // Der Logger hängt selbst von LOG_LEVEL ab, daher hier direkt auf stderr.
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }

  // Gebauter Server mit ausdrücklich gesetztem NODE_ENV=development/test (00-chore/01, AK-1.7)
  if (!import.meta.dev && env.NODE_ENV !== 'production') {
    useLogger().warn({ nodeEnv: env.NODE_ENV }, `built server running with NODE_ENV=${env.NODE_ENV}: session cookie without Secure, CSRF key not required`)
  }
})
