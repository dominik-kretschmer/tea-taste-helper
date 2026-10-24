# 13 – Gesperrter Admin kann nicht entsperrt werden; gemeinsamer Moderations-Helper

> Chore-Issue zu [00-chore](../README.md), aus dem Code-Review vom 2026-10-24. Phase 1: Anforderungen. Status: **umgesetzt (2026-10-24)**

## Befund

- `DELETE /api/admin/users/:id/block` (`block.delete.ts`) prüft mit `assertCanBlock` (`server/utils/users.ts`). Das ist dieselbe Prüfung wie beim Sperren, und sie lehnt jeden Admin als Ziel mit 403 ab.
- Ein Nutzer kann Admin werden, während er gesperrt ist. Weder `PATCH /api/admin/users/:id/role` (`role.patch.ts`) noch die Startup-Beförderung von `ADMIN_EMAIL` (`server/plugins/admin-bootstrap.ts`) prüfen die Sperre. Danach antwortet das Entsperren mit 403, und das Konto bleibt **dauerhaft gesperrt**: bei unbefristeter Sperre für immer, sonst bis zum Ablauf der Frist. Beim `ADMIN_EMAIL`-Konto fehlt damit im schlimmsten Fall der einzige Admin.
- Das Muster „ID lesen → Ziel-User laden → 404 → Berechtigung prüfen“ steht viermal kopiert in `server/api/admin/users/[id]/`: `block.post.ts`, `block.delete.ts`, `bulk-revert.get.ts`, `bulk-revert.post.ts`.

## Ziel

Admins können jeden gesperrten Nutzer entsperren, auch einen, der inzwischen Admin ist. Das Laden des Ziel-Users steht an einer Stelle. Die Regeln fürs Sperren (05 AK-6.5) bleiben gleich.

## User Stories

- **US-1:** Als Admin möchte ich jeden gesperrten Nutzer entsperren können, auch wenn er inzwischen Admin ist, damit kein Konto dauerhaft unbenutzbar bleibt.
- **US-2:** Als Entwickler möchte ich das Laden des Ziel-Users an einer Stelle haben, damit die vier Moderationsrouten nicht auseinanderlaufen.

## Akzeptanzkriterien

- **AK-1.1** (zu US-1): WENN ein Admin einen gesperrten Nutzer mit Rolle `admin` entsperrt, DANN antwortet die API mit 200. Danach sind `blockedAt`, `blockedUntil`, `blockReason` und `blockedById` leer, ein `USER_UNBLOCKED`-Eintrag steht im Audit-Log, und der Nutzer kann sich wieder anmelden.
- **AK-1.2** (zu US-1): WENN ein Admin einen gesperrten Moderator entsperrt, DANN 200 (wie bisher).
- **AK-1.3** (zu US-1): WENN ein Moderator einen gesperrten Nutzer mit Rolle `user` entsperrt, DANN 200 (wie bisher).
- **AK-1.4** (zu US-1): WENN ein Moderator einen Moderator oder einen Admin entsperren will, DANN 403 `FORBIDDEN`.
- **AK-1.5** (zu US-1): Sperren und Massen-Zurücksetzen prüfen weiter nach 05 AK-6.5. Admins sind nicht sperrbar, Moderatoren sperren nur `user`, niemand sperrt sich selbst. Der bestehende Test „setzt die Rollenregeln durch (AK-6.5)“ bleibt unverändert grün.
- **AK-1.6** (zu US-1): Ein API-Test deckt den Ablauf aus dem Befund ab: Moderator sperren, zum Admin befördern, Entsperren als Moderator → 403, Entsperren als Admin → 200.
- **AK-2.1** (zu US-2): Alle vier Routen laden den Ziel-User über `loadModerationTarget` in `server/utils/users.ts`. Keine der vier Routen ruft `prisma.user.findUnique` noch selbst auf.
- **AK-2.2** (zu US-2): Unbekannte oder ungültige IDs ergeben auf allen vier Routen weiter 404 `NOT_FOUND`. Die Reihenfolge ist: `requireRole` (401/403) → Ziel laden (404) → Body bzw. Query prüfen (400) → `assertCanBlock` bzw. Entsperr-Regel (403). Neu gegenüber heute: Eine gültige, aber unbekannte UUID mit ungültigem Body ergibt 404 statt 400.

## Nicht im Umfang

- Beförderung gesperrter Nutzer verhindern (`role.patch.ts`, `admin-bootstrap.ts`). Das Entsperren reicht, damit kein Konto hängen bleibt.
- `block.post.ts` ohne Transaktion (laut Review bewusst ausgeklammert).
- Massen-Zurücksetzen für Admins: `bulk-revert` prüft weiter mit `assertCanBlock`. Die Änderungen eines Nutzers, der inzwischen Admin ist, lassen sich damit nicht in einem Zug zurücksetzen; einzelnes Zurücksetzen bleibt möglich. Bewusst so gelassen, weil Admins nach 05 AK-6.5 nicht moderiert werden.
- Selbst-Entsperren: Ein gesperrter Nutzer hat keine Session, deshalb braucht es dafür keine eigene Regel.

## Offene Fragen

- keine (Helper-Umfang mit dem Nutzer geklärt am 2026-10-24: Er lädt nur und wirft 404; jede Route prüft danach selbst)
