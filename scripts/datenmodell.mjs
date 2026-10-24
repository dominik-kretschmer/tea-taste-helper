// Erzeugt docs/datenmodell.md (Mermaid-ER-Diagramm, Beziehungen, Enums) aus dem Prisma-Schema.
// Aufruf: npm run db:erd   ·   Prüfung, ob die Datei aktuell ist: test/unit/datenmodell.test.ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
export const OUTPUT = join(root, 'docs/datenmodell.md')

/** Schema als Text: alle Dateien aus prisma/schema/ (eine pro Tabelle, 00-chore/11) */
export function readSchema() {
  const dir = join(root, 'prisma/schema')
  return readdirSync(dir).filter(f => f.endsWith('.prisma')).sort().map(f => readFileSync(join(dir, f), 'utf8')).join('\n')
}

function parseBlocks(text) {
  const blocks = []
  for (const m of text.matchAll(/^(model|enum)\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) blocks.push({ kind: m[1], name: m[2], body: m[3] })
  return blocks
}

function parseFields(body) {
  const fields = []
  const blockAttrs = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    if (line.startsWith('@@')) {
      blockAttrs.push(line)
      continue
    }
    const m = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/)
    if (m) fields.push({ name: m[1], type: m[2], list: !!m[3], optional: !!m[4], attrs: m[5] })
  }
  return { fields, blockAttrs }
}

const listOf = s => s.split(',').map(x => x.trim())

export function generate(schema = readSchema()) {
  // Alphabetisch, damit die Ausgabe nicht von der Dateiaufteilung abhängt
  const byName = (a, b) => a.name.localeCompare(b.name, 'en')
  const blocks = parseBlocks(schema)
  const models = blocks.filter(b => b.kind === 'model').sort(byName)
  const enums = blocks.filter(b => b.kind === 'enum').sort(byName)
  const modelNames = new Set(models.map(m => m.name))

  const entities = []
  const relations = []
  for (const model of models) {
    const { fields, blockAttrs } = parseFields(model.body)
    const pk = new Set(blockAttrs.flatMap(a => (a.match(/^@@id\(\[([^\]]+)\]/) ? listOf(RegExp.$1) : [])))
    const composite = blockAttrs.flatMap(a => (a.match(/^@@unique\(\[([^\]]+)\]/) ? [listOf(RegExp.$1)] : []))
    const fk = new Set(fields.flatMap(f => (f.attrs.match(/@relation\([^)]*fields:\s*\[([^\]]+)\]/) ? listOf(RegExp.$1) : [])))

    const lines = [`  ${model.name} {`]
    for (const f of fields) {
      if (modelNames.has(f.type)) continue // Relationsfeld, keine Spalte
      const keys = []
      if (/@id\b/.test(f.attrs) || pk.has(f.name)) keys.push('PK')
      if (fk.has(f.name)) keys.push('FK')
      if (/@unique\b/.test(f.attrs)) keys.push('UK')
      const notes = []
      if (f.optional) notes.push('optional')
      const db = f.attrs.match(/@db\.(\w+(\([^)]*\))?)/)
      if (db) notes.push(db[1])
      const def = f.attrs.match(/@default\(((?:[^()]|\([^()]*\))*)\)/)
      if (def) notes.push(`default ${def[1]}`)
      for (const group of composite) if (group.includes(f.name)) notes.push(`unique(${group.join(', ')})`)
      const note = notes.length ? ` "${notes.join('; ').replaceAll('"', '\'')}"` : ''
      lines.push(`    ${f.type}${f.list ? '_list' : ''} ${f.name}${keys.length ? ` ${keys.join(', ')}` : ''}${note}`)
    }
    lines.push('  }')
    entities.push(lines.join('\n'))

    for (const f of fields) {
      const rel = f.attrs.match(/@relation\(([^)]*)\)/)
      if (!modelNames.has(f.type) || !rel || !rel[1].includes('fields:')) continue // Gegenseite (Liste)
      const column = rel[1].match(/fields:\s*\[([^\]]+)\]/)[1].trim()
      const onDelete = rel[1].match(/onDelete:\s*(\w+)/)?.[1] ?? '–'
      const column1 = fields.find(x => x.name === column)
      const oneToOne = /@unique\b|@id\b/.test(column1?.attrs ?? '')
      relations.push({ from: model.name, column, field: f.name, to: f.type, optional: f.optional, onDelete, oneToOne })
    }
  }

  const edges = relations.map(r => `  ${r.to} ${r.optional ? '|o' : '||'}--${r.oneToOne ? 'o|' : 'o{'} ${r.from} : "${r.column}"`)
  const relationRows = relations.map(r => `| \`${r.from}.${r.column}\` | \`${r.to}\` | ${r.optional ? 'optional' : 'Pflicht'} | \`${r.onDelete}\` |`)
  const enumRows = enums.map((e) => {
    const values = e.body.split('\n').map(v => v.trim()).filter(v => v && !v.startsWith('//'))
    return `| \`${e.name}\` | ${values.map(v => `\`${v}\``).join(', ')} |`
  })

  return `# Datenmodell

> **Automatisch erzeugt** aus dem Prisma-Schema mit \`npm run db:erd\` – nicht von Hand bearbeiten.
> Nach jeder Schema-Änderung neu erzeugen; \`test/unit/datenmodell.test.ts\` schlägt sonst fehl.

${models.length} Tabellen, ${relations.length} Beziehungen, ${enums.length} Enums.

## Lesehilfe

- **PK** Primärschlüssel, **FK** Fremdschlüssel, **UK** eindeutig. \`unique(a, b)\` = gemeinsam eindeutig.
- In Anführungszeichen: \`optional\` (darf leer sein), Datenbank-Typ (z.B. \`VarChar(80)\`), Standardwert.
- Linien: \`||\` genau einer, \`|o\` keiner oder einer, \`o{\` keiner oder viele. Die Beschriftung ist die Fremdschlüssel-Spalte.
- Felder mit Enum-Typ (z.B. \`Role\`): erlaubte Werte unter [Enums](#enums).

## Diagramm

\`\`\`mermaid
erDiagram
${entities.join('\n')}
${edges.join('\n')}
\`\`\`

## Beziehungen

| Fremdschlüssel | zeigt auf | Pflicht/optional | beim Löschen des Ziels |
|---|---|---|---|
${relationRows.join('\n')}

\`Cascade\`: abhängige Zeilen werden mitgelöscht · \`SetNull\`: Verweis wird geleert · \`Restrict\`: Löschen ist verboten, solange es Verweise gibt.

### Verweise ohne Fremdschlüssel

Diese Spalten zeigen auf eine Zutat **oder** einen Tee; welche Tabelle, sagt \`entityType\` (\`CatalogType\`). Ein echter Fremdschlüssel geht nicht, weil es zwei Zieltabellen sind. Zutaten und öffentliche Tees werden nie gelöscht.

| Spalte | zeigt auf |
|---|---|
| \`Report.entityId\` | gemeldete Zutat bzw. gemeldeter Tee |
| \`Report.duplicateOfId\` | bei \`reason = duplicate\`: der Eintrag, von dem es ein Duplikat ist (gleicher \`entityType\`) |
| \`CatalogEvent.entityId\` | Zutat bzw. Tee, um den es geht |
| \`CatalogEvent.targetId\` | beim Zusammenführen: der Zieleintrag |

## Enums

| Enum | Werte |
|---|---|
${enumRows.join('\n')}

## Nur in SQL

Einige Datenbankobjekte kennt Prisma nicht; sie stehen nur in den Migrationen und deshalb nicht im Diagramm. Die Liste steht in der [README](../README.md#migrationen) unter „Migrationen“.
`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(OUTPUT, generate())
  console.log(`geschrieben: ${OUTPUT}`)
}
