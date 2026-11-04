# 14 – Veröffentlichen speichert über `saveTeaVersion`

> Chore-Issue zu [00-chore](../README.md), aus dem Code-Review vom 2026-10-24. Phase 1: Anforderungen. Status: **Entwurf (2026-10-24)**

## Befund

`server/api/teas/[id]/publish.post.ts` (Zeilen 17–29) baut die Speicherlogik von `saveTeaVersion` (`server/utils/teas.ts`) nach: aktuelle Version mit `expectedVersion` deaktivieren, 409 bei Konflikt, Duplikatregel prüfen, neue Version schreiben. Laut JSDoc ist `saveTeaVersion` aber der „einzige Weg für Änderungen am Inhalt“.

Die Kopie fehlt schon heute an einer Stelle hinter dem Original zurück: Sie fängt `P2002` nicht ab. Bei zwei gleichzeitigen Veröffentlichungen gibt es deshalb einen 500er statt 409 `EDIT_CONFLICT`.

## Ziel

Veröffentlichen nutzt `saveTeaVersion`. Damit ändert sich Speichern, Konflikterkennung oder Duplikatregel an einer Stelle für alle Wege.

## User Stories

- **US-1:** Als Entwickler möchte ich, dass jede neue Teeversion über `saveTeaVersion` entsteht, damit Regeln zum Speichern nur an einer Stelle stehen.

## Akzeptanzkriterien

- **AK-1.1:** WENN der Ersteller einen privaten Tee mit aktueller `version` veröffentlicht, DANN 200 mit `visibility: 'public'` und `version` + 1, und `TEA_PUBLISHED` steht im Audit-Log (wie bisher).
- **AK-1.2:** WENN `version` veraltet ist, DANN 409 `EDIT_CONFLICT` mit `details.currentVersion` = aktuelle Version (wie bisher).
- **AK-1.3:** WENN ein Name des Tees in irgendeiner Sprache mit Marke schon öffentlich vergeben ist, DANN 409 mit `details: { teaId, locale }`, und der Tee bleibt privat in der alten Version. Die Prüfung erfasst alle Sprachen (die alte Sichtbarkeit war `private`).
- **AK-1.4:** `ALREADY_PUBLIC` (400), 404 für Fremde und 401 für Gäste bleiben unverändert.
- **AK-1.5:** `publish.post.ts` enthält kein `$executeRaw`, kein `writeTeaVersion` und kein `assertTeaNamesAvailable` mehr, sondern ruft `saveTeaVersion` auf.
- **AK-1.6:** Alle bestehenden Tests bleiben ohne Änderung grün.

## Nicht im Umfang

- Neuer Test für gleichzeitige Veröffentlichungen (P2002). Das Verhalten kommt von `saveTeaVersion` und ist dort nicht eigens getestet; ein Wettlauf im API-Test wäre unzuverlässig.
- `index.post.ts` (Anlegen) ruft `writeTeaVersion` weiter direkt auf. Dort gibt es keine Vorgängerversion, also ist `saveTeaVersion` nicht anwendbar.

## Offene Fragen

- keine
