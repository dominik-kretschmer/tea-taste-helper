import { inject } from 'vitest'
import { testDatabaseUrl } from './test-env'

// Läuft in jedem Test-Worker; der von @nuxt/test-utils gestartete Server erbt diese Umgebung.
process.env.DATABASE_URL = testDatabaseUrl()
process.env.OLLAMA_URL = inject('ollamaUrl')
