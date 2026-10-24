import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Ablageregeln für prisma/schema/ (00-chore/11): eine Datei pro Tabelle, Enums in enums.prisma,
// Many-to-many nur als Verbindungstabelle (eigenes Model in eigener Datei).

const SCHEMA_DIR = fileURLToPath(new URL('../../prisma/schema', import.meta.url))

interface SchemaFile {
  name: string
  content: string
}

interface Block {
  kind: string
  name: string
  body: string
}

const blocksOf = (content: string): Block[] =>
  [...content.matchAll(/^(model|enum|generator|datasource)\s+(\w+)\s*\{([\s\S]*?)^\}/gm)]
    .map(m => ({ kind: m[1]!, name: m[2]!, body: m[3]! }))

const kebab = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

/** Relationsfelder eines Models: Name, Zieltyp, Liste?, Relationsname */
function relationFields(body: string, models: Set<string>) {
  return body.split('\n').flatMap((raw) => {
    const m = raw.trim().match(/^(\w+)\s+(\w+)(\[\])?\??(.*)$/)
    if (!m || !models.has(m[2]!)) return []
    const relation = m[4]!.match(/@relation\(\s*(?:name:\s*)?"([^"]+)"/)?.[1] ?? null
    return [{ field: m[1]!, target: m[2]!, list: !!m[3], relation }]
  })
}

/** Alle Verstöße gegen die Ablageregeln; leer = in Ordnung */
export function checkSchemaLayout(files: SchemaFile[]): string[] {
  const problems: string[] = []
  const all = files.flatMap(file => blocksOf(file.content).map(block => ({ ...block, file: file.name })))

  for (const file of files) {
    const blocks = all.filter(b => b.file === file.name)
    if (file.name === 'schema.prisma') {
      for (const b of blocks) if (b.kind === 'model' || b.kind === 'enum') problems.push(`schema.prisma enthält ${b.kind} ${b.name} – nur generator und datasource erlaubt`)
      continue
    }
    if (file.name === 'enums.prisma') {
      for (const b of blocks) if (b.kind !== 'enum') problems.push(`enums.prisma enthält ${b.kind} ${b.name} – nur Enums erlaubt`)
      continue
    }
    for (const b of blocks) if (b.kind === 'enum') problems.push(`${file.name} enthält enum ${b.name} – Enums gehören nach enums.prisma`)
    const models = blocks.filter(b => b.kind === 'model')
    if (models.length !== 1) {
      problems.push(`${file.name} enthält ${models.length} Models – genau eines pro Datei`)
      continue
    }
    const expected = `${kebab(models[0]!.name)}.prisma`
    if (file.name !== expected) problems.push(`Model ${models[0]!.name} steht in ${file.name} – Datei muss ${expected} heißen`)
  }

  // Implizite Many-to-many: Listenfeld auf beiden Seiten derselben Relation
  const models = all.filter(b => b.kind === 'model')
  const names = new Set(models.map(m => m.name))
  const fields = new Map(models.map(m => [m.name, relationFields(m.body, names)]))
  for (const model of models) {
    for (const f of fields.get(model.name)!) {
      if (!f.list) continue
      const counterparts = fields.get(f.target)!.filter(g =>
        g.target === model.name && g.relation === f.relation && !(f.target === model.name && g.field === f.field))
      if (counterparts.length && counterparts.every(g => g.list)) {
        const pair = [`${model.name}.${f.field}`, ...counterparts.map(g => `${f.target}.${g.field}`)].sort().join(' ↔ ')
        const message = `implizite Many-to-many-Beziehung ${pair} – als Verbindungstabelle (eigenes Model in eigener Datei) anlegen`
        if (!problems.includes(message)) problems.push(message)
      }
    }
  }
  return problems
}

describe('Prisma-Schema in prisma/schema/', () => {
  const readFiles = () => readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.prisma')).sort()
    .map(name => ({ name, content: readFileSync(join(SCHEMA_DIR, name), 'utf8') }))

  it('hat schema.prisma mit generator und datasource sowie enums.prisma', () => {
    const files = readFiles()
    const blocks = blocksOf(files.find(f => f.name === 'schema.prisma')?.content ?? '')
    expect(blocks.map(b => b.kind).sort()).toEqual(['datasource', 'generator'])
    expect(files.map(f => f.name)).toContain('enums.prisma')
  })

  it('hält die Ablageregeln ein', () => {
    expect(checkSchemaLayout(readFiles())).toEqual([])
  })
})

describe('checkSchemaLayout (Gegenproben)', () => {
  const base = { name: 'schema.prisma', content: 'generator client {\n  provider = "prisma-client"\n}\n' }

  it('meldet falschen Dateinamen, zwei Models in einer Datei und Enums außerhalb von enums.prisma', () => {
    const problems = checkSchemaLayout([
      base,
      { name: 'benutzer.prisma', content: 'model User {\n  id String @id\n}\n' },
      { name: 'zwei.prisma', content: 'model A {\n  id String @id\n}\nmodel B {\n  id String @id\n}\n' },
      { name: 'tea.prisma', content: 'enum Kind {\n  x\n}\nmodel Tea {\n  id String @id\n}\n' },
    ])
    expect(problems).toEqual([
      'Model User steht in benutzer.prisma – Datei muss user.prisma heißen',
      'zwei.prisma enthält 2 Models – genau eines pro Datei',
      'tea.prisma enthält enum Kind – Enums gehören nach enums.prisma',
    ])
  })

  it('meldet implizite Many-to-many, erlaubt 1:n (auch selbstbezogen) und Verbindungstabellen', () => {
    const implicit = checkSchemaLayout([
      base,
      { name: 'post.prisma', content: 'model Post {\n  id String @id\n  tags Tag[]\n}\n' },
      { name: 'tag.prisma', content: 'model Tag {\n  id String @id\n  posts Post[]\n}\n' },
    ])
    expect(implicit).toEqual(['implizite Many-to-many-Beziehung Post.tags ↔ Tag.posts – als Verbindungstabelle (eigenes Model in eigener Datei) anlegen'])

    const allowed = checkSchemaLayout([
      base,
      { name: 'ingredient.prisma', content: [
        'model Ingredient {',
        '  id           String @id',
        '  mergedIntoId String?',
        '  mergedInto   Ingredient? @relation("IngredientMerge", fields: [mergedIntoId], references: [id])',
        '  mergedFrom   Ingredient[] @relation("IngredientMerge")',
        '  uses         Usage[]',
        '}',
      ].join('\n') },
      { name: 'usage.prisma', content: 'model Usage {\n  ingredientId String\n  ingredient Ingredient @relation(fields: [ingredientId], references: [id])\n}\n' },
    ])
    expect(allowed).toEqual([])
  })
})
