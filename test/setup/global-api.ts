import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import pg from 'pg'
import type { TestProject } from 'vitest/node'
import { testDatabaseUrl } from './test-env'

declare module 'vitest' {
  interface ProvidedContext {
    ollamaUrl: string
  }
}

/** Leert alle Anwendungstabellen der Test-DB, damit jeder Lauf mit leerem Zustand beginnt. */
async function truncateAll(databaseUrl: string) {
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    )
    if (rows.length) {
      await client.query(`TRUNCATE ${rows.map(row => `"${row.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`)
    }
  }
  finally {
    await client.end()
  }
}

// Läuft einmal vor allen API-Tests: Migrationen auf die Test-DB, Tabellen leeren, Ollama-Stub starten.
export default async function setup(project: TestProject) {
  let databaseUrl: string
  try {
    databaseUrl = testDatabaseUrl()
  }
  catch (error) {
    // Fester Stack: Vites Source-Map-Aufbereitung stürzt bei Fehlern aus dem globalSetup ab
    // und verdeckt sonst die eigentliche Meldung.
    if (error instanceof Error) error.stack = `${error.name}: ${error.message}`
    throw error
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'pipe',
  })
  await truncateAll(databaseUrl)

  // Ersetzt Ollama, damit Tests und CI ohne GPU und Modell laufen.
  const stub = createServer((req, res) => {
    if (req.url === '/api/version') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ version: 'stub' }))
      return
    }
    res.writeHead(404).end()
  })
  await new Promise<void>(resolve => stub.listen(0, '127.0.0.1', resolve))
  project.provide('ollamaUrl', `http://127.0.0.1:${(stub.address() as AddressInfo).port}`)

  return () => new Promise<void>(resolve => stub.close(() => resolve()))
}
