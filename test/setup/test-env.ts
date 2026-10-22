import { config } from 'dotenv'

config({ quiet: true })

/** URL der Test-Datenbank; bricht ab, statt auf die Entwicklungsdatenbank auszuweichen (AK-8.2). */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    throw new Error('TEST_DATABASE_URL ist nicht gesetzt – API-Tests laufen nur gegen eine eigene Test-Datenbank (siehe .env.example).')
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL darf nicht auf dieselbe Datenbank zeigen wie DATABASE_URL.')
  }
  return url
}
