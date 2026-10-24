# Aufgaben: 13 – Gesperrten Admin entsperren, `loadModerationTarget`

> Phase 3 zu [design.md](design.md). Status: **umgesetzt (2026-10-24)**

- [x] 1. Test zuerst: neuer Fall „entsperrt einen inzwischen beförderten Admin“ in `test/api/block.test.ts`
  - Dateien: `test/api/block.test.ts`
  - Erfüllt: AK-1.6 (AK-1.1, AK-1.2, AK-1.4), AK-2.2 (Schritt 7)
  - Prüfung: `npx vitest run test/api/block.test.ts` → der neue Fall schlägt fehl (Entsperren als Admin gibt 403, bzw. 400 statt 404 in Schritt 7), alle anderen sind grün
- [x] 2. `loadModerationTarget(event)` in `server/utils/users.ts`, JSDoc von `assertCanBlock` ergänzen
  - Dateien: `server/utils/users.ts`
  - Erfüllt: AK-2.1
  - Prüfung: `npm run typecheck`
- [x] 3. `block.post.ts`, `bulk-revert.get.ts`, `bulk-revert.post.ts` auf den Helper umstellen (Reihenfolge: `requireRole` → Helper → Body/Query → `assertCanBlock`; `target.id` statt `id`)
  - Dateien: die drei Routen
  - Erfüllt: AK-1.5, AK-2.1, AK-2.2
  - Prüfung: `npx vitest run test/api/block.test.ts test/api/moderation.test.ts test/api/revert.test.ts` grün (bis auf den neuen Fall aus 1)
- [x] 4. `block.delete.ts`: Helper plus Entsperr-Regel, ohne `assertCanBlock`
  - Dateien: `server/api/admin/users/[id]/block.delete.ts`
  - Erfüllt: AK-1.1–AK-1.4, AK-2.1, AK-2.2
  - Prüfung: `npx vitest run test/api/block.test.ts` vollständig grün; `grep -n findUnique 'server/api/admin/users/[id]/'block*.ts 'server/api/admin/users/[id]/'bulk-revert*.ts` ohne Treffer (Exit-Code 1)
- [x] 5. Nachtrag an 05 AK-6.5 (Entsperr-Regel)
  - Dateien: `.claude/specs/05-moderation/requirements.md`
  - Prüfung: Sichtprüfung
- [x] 6. Abschluss: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` grün; Status in README und hier nachtragen; ein Commit
