# 05 – Begründung: npm-audit-Meldung zu node-forge wird ignoriert

> Gehört zu [requirements.md](requirements.md). Status: **geschlossen (2026-10-23), Meldung wird bis auf Weiteres ignoriert**

## Stand der Meldung

`npm audit` am 2026-10-23 (nach den Commits zu 00-chore 01–10):

- **7 × high, 0 × critical.** Alle Meldungen gehen auf **eine** Lücke zurück: [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) in `node-forge`. npm meldet zusätzlich jedes Paket auf dem Weg dorthin (`listhen`, `nitropack`, `@nuxt/nitro-server`, `@nuxt/vite-builder`, `@nuxt/vite-server`, `nuxt`).
- Die Meldungen zu `braces`, `micromatch`, `fast-glob` und `globby` aus dem Befund (11 × high) erscheinen nicht mehr. Die installierten Versionen (`micromatch` 4.0.8, `braces` 3.0.3) sind unverändert; die Einträge in der Advisory-Datenbank haben sich offenbar geändert.

```
nuxt 4.6.2
 └─ @nuxt/nitro-server 4.6.2
     └─ nitropack 2.13.5
         └─ listhen 1.10.1
             └─ node-forge 1.4.0
```

## Die Lücke

`node-forge` ist eine Krypto-Bibliothek in reinem JavaScript. Beim Prüfen von RSA-Signaturen nach PKCS#1 v1.5 akzeptiert sie Signaturen mit zusätzlichen, verschachtelten `DigestAlgorithm`-Elementen. Wer damit fremde Signaturen prüft, könnte eine manipulierte Signatur für gültig halten.

## Warum sie uns nicht betrifft

1. **Nur im Dev-Server.** `listhen` ist der HTTP-Server hinter `nuxt dev`. `node-forge` braucht er nur, um auf Wunsch ein selbstsigniertes HTTPS-Zertifikat für die lokale Entwicklung zu erzeugen. Fremde Signaturen prüft dabei niemand.
2. **Nicht im gebauten Server.** In `.output/server/node_modules` liegen weder `node-forge` noch `listhen`, und keine Datei unter `.output/server` verweist auf `node-forge` (geprüft am 2026-10-23 per `ls` und `grep -rl node-forge .output/server`). Die laufende App enthält den betroffenen Code also nicht.
3. **Kein eigener Gebrauch.** Die App nutzt `node-forge` nirgends. Passwörter laufen über `@node-rs/argon2`, Session- und CSRF-Tokens über Node-`crypto`.

## Warum es keinen Fix gibt

- **Kein Patch.** Die Lücke gilt laut Advisory für alle Versionen (`*`); `node-forge` 1.4.0 ist die neueste Version. Ein `overrides` auf eine gepatchte Version ist deshalb nicht möglich (AK-1.2 entfällt).
- **Der Vorschlag von npm ist ein Downgrade.** `npm audit fix --force` würde `nuxt` von 4.6.2 auf **4.1.3** herabsetzen, also auf eine ältere Version ohne die betroffene `listhen`-Kette. Das tauscht eine Meldung ohne praktische Wirkung gegen eine veraltete Nuxt-Version und ist ausgeschlossen.

## Entscheidung

- Die Meldung wird **ignoriert**. Es gibt keine `overrides`, kein Downgrade und keine Änderung an `package.json`.
- Damit entfällt auch der automatische Audit-Schritt in der CI (AK-1.5): `npm audit --audit-level=high` würde dauerhaft an dieser Meldung scheitern. `nuxt` steht unter `dependencies`, daher hilft voraussichtlich auch `--omit=dev` nicht. Eine Ausnahme für genau diese Advisory bietet `npm audit` nicht an.
- Neue Lücken in anderen Paketen meldet weiterhin Dependabot (`.github/dependabot.yml`).

## Wann neu prüfen

Die Entscheidung gilt, bis einer dieser Fälle eintritt:

- `node-forge` erscheint in einer gepatchten Version (Advisory nennt einen Fix-Bereich),
- `listhen` bzw. `nitropack` entfernen `node-forge` oder aktualisieren es,
- ein Nuxt-Update ändert die Kette,
- `node-forge` taucht im gebauten Server auf.

Prüfen mit:

```bash
npm audit
npm ls node-forge
npm run build && ls .output/server/node_modules | grep -E "node-forge|listhen"
```
