import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  // Ordner: eine Datei pro Tabelle, Enums in enums.prisma (00-chore/11)
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
