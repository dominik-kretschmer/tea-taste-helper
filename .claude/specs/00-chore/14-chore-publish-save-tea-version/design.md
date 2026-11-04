# Design: 14 – Veröffentlichen speichert über `saveTeaVersion`

> Phase 2 zu [requirements.md](requirements.md). Status: **Entwurf (2026-10-24)**

## Überblick

Zeilen 17–30 von `publish.post.ts` werden ersetzt:

```ts
const before = toTeaSnapshot(current.tea, current.version)
// Ab jetzt gilt die Duplikatregel für alle Sprachen (AK-4.2)
const saved = await saveTeaVersion(tx, {
  teaId: id,
  expectedVersion: input.version,
  before,
  after: { ...before, visibility: 'public' },
  authorId: user.id,
  note: input.note,
})
// Kann nicht eintreten: Die Sichtbarkeit ändert sich immer (ALREADY_PUBLIC ist oben geprüft)
if (!saved.changed) throw new AppError(400, 'ALREADY_PUBLIC', 'The tea is already public')
return toTeaDetail(tx, current.tea, saved.version, user)
```

Der Zweig `!saved.changed` ist nur für TypeScript nötig (Union-Typ des Ergebnisses). Er wirft denselben Fehler wie die Prüfung davor, statt still eine alte Version zurückzugeben.

## Warum das Verhalten gleich bleibt

| Schritt | bisher in `publish.post.ts` | in `saveTeaVersion` |
|---|---|---|
| Änderung erkennen | – | `diffTeaSnapshots` meldet `visibility` (`TEA_FIELDS`), also immer `changed` |
| Zutaten prüfen | – | nur bei Zutatenänderung, also nie |
| Deaktivieren | `UPDATE … version = input.version` | dasselbe mit `expectedVersion` |
| Konflikt | 409, `currentVersion` aus der geladenen Version | 409, `currentVersion` frisch aus der DB. In derselben Transaktion ist das derselbe Wert, außer bei einem Wettlauf; dann ist der neue Wert der richtigere |
| Duplikatregel | `assertTeaNamesAvailable(tx, snapshot, { teaId })` ohne `before` | mit `before`. Weil `before.visibility === 'private'`, ist `unchanged` für jede Sprache `false`, also wird jeder Name geprüft wie bisher (AK-1.3) |
| Schreiben | `writeTeaVersion(..., version: input.version + 1)` | dasselbe mit `expectedVersion + 1`, Kennzeichnungen leer |
| gleichzeitiges Schreiben | P2002 → 500 | P2002 → 409 `EDIT_CONFLICT` (Verbesserung) |

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|-------|--------------|-------|
| `server/api/teas/[id]/publish.post.ts` | geändert | Block durch `saveTeaVersion` ersetzt |

`writeTeaVersion` und `assertTeaNamesAvailable` bleiben exportiert: `index.post.ts` nutzt beide weiter direkt, `moderation.ts` nutzt `assertTeaNamesAvailable`.

## API

Unverändert, bis auf 409 statt 500 bei gleichzeitigem Veröffentlichen.

## Entscheidungen

- **`!saved.changed` wirft `ALREADY_PUBLIC`** – lässt sich nicht erreichen, aber wenn doch, ist ein klarer Fehler besser als eine stille 200 ohne neue Version. – Verworfen: Non-null-Assertion bzw. Cast (verdeckt einen späteren Fehler in `diffTeaSnapshots`).
- **Kein neuer Test** – die bestehenden vier Tests in „Veröffentlichen und Löschen“ (ohne den Lösch-Test) decken AK-1.1, AK-1.2 und AK-1.4 ab. AK-1.3 ist nur für die Originalsprache (`de`) getestet; dass alle Sprachen geprüft werden, folgt aus `assertTeaNamesAvailable` (Schleife über `CONTENT_LOCALES`, siehe Tabelle oben). Ein Test mit Duplikat in einer zweiten Sprache fehlt auch dort; er gehört nicht zu diesem Chore.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|--------------------|-----------------|
| AK-1.1 | Test „veröffentlicht einen privaten Tee …“ (`test/api/teas.test.ts`) |
| AK-1.2 | Test „nur der Ersteller veröffentlicht; Konflikt bei veralteter Version“ |
| AK-1.3 | Test „prüft beim Veröffentlichen die Duplikatregel“ (nur `de`); für weitere Sprachen Tabelle oben (Duplikatregel) |
| AK-1.4 | Prüfungen vor dem Block bleiben unverändert; 404 in „nur der Ersteller …“, `ALREADY_PUBLIC` in „veröffentlicht einen privaten Tee …“, 401 in „Gäste → 401“ |
| AK-1.5 | `grep -nE 'executeRaw|writeTeaVersion|assertTeaNamesAvailable' 'server/api/teas/[id]/publish.post.ts'` ohne Treffer |
| AK-1.6 | `npm test` ohne Änderung an Tests |
