# 08 – zod löst CSP-Verstöße „script-src eval“ aus

> Chore-Issue zu [00-chore](../README.md). Phase 1: Anforderungen. Status: **freigegeben (2026-10-23)**

## Befund

zod 4 prüft beim ersten Schema-Aufruf mit `new Function`, ob es Code erzeugen darf (JIT). Die CSP verbietet das (kein `unsafe-eval`, richtig so). zod fängt die Ablehnung ab und arbeitet ohne JIT weiter, aber der Browser meldet jedes Mal einen CSP-Verstoß.

Nachgestellt am 2026-10-23 (Dev und Production): `securitypolicyviolation` mit `script-src eval` auf `/login`, `/register`, `/zutaten` und allen Formularseiten. Folge: Echte CSP-Verstöße gehen in diesem Rauschen unter, und die früheren Abnahmen („keine CSP-Verstöße“) haben ihn nicht bemerkt, weil Chrome ihn nicht als Konsolenfehler meldet.

## Ziel

Keine CSP-Verstöße mehr durch zod; echte Verstöße sind wieder sichtbar.

## Akzeptanzkriterien

- **AK-1.1:** WENN eine Seite geladen und ein Formular abgeschickt wird, DANN meldet der Browser keinen `securitypolicyviolation` (Dev und Production).
- **AK-1.2:** Die Prüfung der Schemas verhält sich im Browser und auf dem Server unverändert (bestehende Unit- und API-Tests grün).
- **AK-1.3:** Die CSP bleibt unverändert (kein `unsafe-eval`).

## Nicht im Umfang

- Weitere CSP-Änderungen.

## Offene Fragen

- keine
