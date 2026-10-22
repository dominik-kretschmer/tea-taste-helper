// Bricht den Serverstart ab, wenn die Umgebung unvollständig oder ungültig ist (AK-3.2).
export default defineNitroPlugin(() => {
  try {
    useEnv()
  }
  catch (error) {
    // Der Logger hängt selbst von LOG_LEVEL ab, daher hier direkt auf stderr.
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
})
