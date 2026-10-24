# Design: 13 – Gesperrten Admin entsperren, `loadModerationTarget`

> Phase 2 zu [requirements.md](requirements.md). Status: **umgesetzt (2026-10-24)**

## Überblick

Ein neuer Helper `loadModerationTarget(event)` in `server/utils/users.ts` liest die ID, lädt den Nutzer und wirft 404. Die Berechtigung prüft jede Route danach selbst:

- `block.post.ts`, `bulk-revert.get.ts`, `bulk-revert.post.ts`: wie bisher mit `assertCanBlock`
- `block.delete.ts`: nur noch `target.role !== 'user' && actor.role !== 'admin'` → 403

```ts
/** Ziel-User einer Moderationsroute aus dem Routenparameter `id`; sonst 404. */
export async function loadModerationTarget(event: H3Event): Promise<User> {
  const id = getUserIdParam(event)
  const target = await usePrisma().user.findUnique({ where: { id } })
  if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found')
  return target
}
```

**Ohne `actor`-Parameter:** Die Aufgabe nannte `loadModerationTarget(event, actor)`. Weil der Helper nur lädt (Entscheidung vom 2026-10-24), bliebe `actor` ungenutzt, und ESLint würde ihn melden.

```ts
// block.delete.ts
const actor = requireRole(event, 'moderator')
const target = await loadModerationTarget(event)
// Nicht assertCanBlock: Ein Gesperrter kann inzwischen Admin sein (Beförderung, ADMIN_EMAIL) und muss entsperrbar bleiben
if (target.role !== 'user' && actor.role !== 'admin') {
  throw new AppError(403, 'FORBIDDEN', 'Only admins can unblock moderators and admins')
}
```

**Reihenfolge (AK-2.2):** `requireRole` → `loadModerationTarget` → `readValidatedBody` bzw. `getValidatedQuery` → `assertCanBlock` bzw. Entsperr-Regel. Der Helper steht an der Stelle, an der bisher `getUserIdParam` stand; `assertCanBlock` bleibt hinter der Body-Prüfung, also kommt 400 weiter vor 403.

Dadurch ändert sich ein Fall: Eine gültige, aber unbekannte UUID mit ungültigem Body ergab bisher 400 (Body zuerst geprüft) und ergibt jetzt 404. Ungültige UUIDs ergeben wie bisher 404. Dazu kommt bei ungültigem Body eine DB-Abfrage mehr, das ist vernachlässigbar.

Die Routen nutzen danach `target.id` statt der lokalen `id`.

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|-------|--------------|-------|
| `server/utils/users.ts` | geändert | `loadModerationTarget` neu; JSDoc von `assertCanBlock` um „gilt nicht fürs Entsperren“ ergänzt |
| `server/api/admin/users/[id]/block.post.ts` | geändert | Helper + `assertCanBlock` |
| `server/api/admin/users/[id]/block.delete.ts` | geändert | Helper + Entsperr-Regel, ohne `assertCanBlock` |
| `server/api/admin/users/[id]/bulk-revert.get.ts` | geändert | Helper + `assertCanBlock` |
| `server/api/admin/users/[id]/bulk-revert.post.ts` | geändert | Helper + `assertCanBlock` |
| `test/api/block.test.ts` | geändert | neuer Test (AK-1.6) |
| `.claude/specs/05-moderation/requirements.md` | geändert | Nachtrag an AK-6.5: Entsperren dürfen Moderatoren nur `user`, Admins jeden |

`password-reset.post.ts` und `role.patch.ts` laden ihr Ziel anders (nur `select: { id }` bzw. in einer Transaktion) und bleiben unverändert.

## API

Keine neue Route. Verhalten von `DELETE /api/admin/users/:id/block`:

| Akteur → Ziel | bisher | neu |
|---|---|---|
| Moderator → user | 200 | 200 |
| Moderator → moderator / admin | 403 | 403 |
| Admin → user / moderator | 200 | 200 |
| Admin → admin | **403** | **200** |
| unbekannte ID | 404 | 404 |

## Tests

Neuer Fall in `test/api/block.test.ts` (Namen wie die bestehenden Fälle):

1. Nutzer registrieren, `setRole(id, 'moderator')`
2. `block(admin, id)` → 200, `unblock(admin, id)` → 200 (AK-1.2), `block(admin, id)` → 200
3. `admin.patch('/api/admin/users/:id/role', { role: 'admin' })` → 200 (beweist, dass die Beförderung eines Gesperrten möglich ist)
4. `unblock(mod, id)` → 403 (AK-1.4)
5. `unblock(admin, id)` → 200, `body.user.blocked === false`; per `db(...)`: `blockedAt`, `blockedUntil`, `blockReason`, `blockedById` sind `null` (AK-1.1)
6. `loginAs(email)` klappt; `USER_UNBLOCKED` steht im Audit-Log
7. `block(mod, '00000000-0000-7000-8000-000000000000', '1y')` → 404 (unbekannte UUID mit ungültigem Body, AK-2.2)

Der bestehende Test zu AK-6.5 bleibt unverändert (AK-1.5) und deckt schon `unblock(mod, otherMod)` → 403 ab.

## Entscheidungen

- **Helper lädt nur, Prüfung bleibt in der Route** – Entscheidung des Nutzers vom 2026-10-24. Sperren und Entsperren haben verschiedene Regeln, und eine Option im Helper würde sie wieder an einer Stelle vermischen. – Verworfen: Helper mit eingebauter Prüfung und Option `{ unblock: true }`.
- **Entsperren statt Beförderung verbieten** – behebt auch den Fall, dass `ADMIN_EMAIL` beim Start befördert wird. Den Start kann man nicht mit 409 ablehnen. – Verworfen: Sperrprüfung in `role.patch.ts`/`admin-bootstrap.ts` (siehe „Nicht im Umfang“).
- **Keine eigene Funktion `assertCanUnblock`** – die Regel ist eine Zeile und hat genau einen Aufrufer.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|--------------------|-----------------|
| AK-1.1 | Entsperr-Regel in `block.delete.ts`; neuer Test Schritt 5–6 |
| AK-1.2 | Entsperr-Regel (Admin darf alles); neuer Test Schritt 2 |
| AK-1.3 | Entsperr-Regel; bestehender Test „entsperrt sofort … (AK-6.4)“ |
| AK-1.4 | Entsperr-Regel; neuer Test Schritt 4; bestehender AK-6.5-Test (`unblock(mod, otherMod)`) |
| AK-1.5 | `assertCanBlock` unverändert in drei Routen; bestehender AK-6.5-Test |
| AK-1.6 | neuer Test in `block.test.ts` |
| AK-2.1 | `loadModerationTarget`; `grep -n findUnique 'server/api/admin/users/[id]/'block*.ts 'server/api/admin/users/[id]/'bulk-revert*.ts` ohne Treffer (Exit-Code 1; bei 2 stimmt der Pfad nicht) |
| AK-2.2 | Reihenfolge oben; neuer Test Schritt 7; bestehende 404-Fälle in `block.test.ts` und `revert.test.ts`, 401/403 in „schützt die Routen“ |
