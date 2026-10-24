# 00 – Overview: tea-taste-helper

> Gesamt-Spec. Gilt als Wahrheit für alle Feature-Specs (`.claude/specs/01-…/`). Änderungen hier zuerst.

## 1. Ziel

Eine öffentliche, mehrsprachige Web-App, die Tees anhand von **Bewertungen, Zutaten-Vorlieben, Kombinationen und Stimmung** empfiehlt oder **eigene Mischungen aus dem Vorrat** zusammenstellt.

Hintergrund: Zutaten allein sagen den Geschmack nur grob voraus (Anteile, Wechselwirkungen, Zubereitung spielen mit). Sensorische Bewertungen (Gesamtnote, Eigenschaften je Phase, Intensität) verbessern die Vorhersage deutlich und fließen deshalb zurück ins System.

## 2. Begriffe

| Begriff | Bedeutung |
|---|---|
| **Zutat** | Einzelner Bestandteil (z.B. Grüntee, Minze). Öffentlicher Katalog. |
| **Tee** | Kombination aus Zutaten, optional mit Anteilen. Öffentlich oder privat. Gekauft oder selbst gemischt. |
| **Mischung** | Vom System vorgeschlagener Tee aus dem Vorrat; wird beim Ausprobieren als eigener Tee gespeichert. |
| **Vorrat** | Pro Nutzer: verfügbare Zutaten und fertige Tees, Menge optional. |
| **Bewertung** | Pro Nutzer, mehrfach pro Tee möglich, jeweils mit Zubereitung. |
| **Eigenschaft** | Geschmacksmerkmal aus fester Liste (floral, zitrisch, bitter …). |
| **Stimmung / Wirkung** | Feste, vordefinierte Auswahllisten. |

## 3. Nutzer & Rollen

- Öffentliches Mehrnutzer-Produkt.
- **Nutzer:** Katalog anlegen/bearbeiten, auf ältere Versionen zurücksetzen, Einträge melden, eigener Vorrat, Bewertungen, private Tees.
- **Moderator:** Meldungen bearbeiten, alle Änderungen eines Nutzers zurücksetzen, Nutzer sperren (befristet/unbefristet), Duplikate zusammenführen, Einträge ausblenden (weich löschen) und wiederherstellen.
- **Admin:** Rollen vergeben, Systemlisten (Eigenschaften, Stimmungen, Wirkungen) und Einstellungen pflegen.
- Admin-/Moderationsbereich unter `/admin`. Rechte werden **immer serverseitig** geprüft, nicht nur im UI versteckt.

## 4. Katalog (Zutaten & Tees)

- Gemeinsamer, öffentlicher Katalog, von Nutzern befüllt.
- Tees können **privat** sein (nur für den Ersteller sichtbar).
- **Wiki-Prinzip:** Änderungen gehen sofort live, mit vollständiger **Versionshistorie**, Zurücksetzen und Melden.
- Zutatenanteile pro Tee **optional** (gekaufte Tees haben oft keine Angaben).
- Fertige Tees können selbst Bausteine von Mischungen sein.

## 5. Bewertung

- Gesamtnote **1–9**.
- Getrennt nach Phasen: **Anfang, Mitte, Abgang**.
- Pro Phase beliebig viele Eigenschaften aus der **festen, übersetzten Liste**.
- Pro Eigenschaft optional eine Einschätzung: **zu schwach / genau richtig / zu stark**.
- Zubereitung pro Bewertung: **Wassertemperatur, Ziehzeit, Menge**.
- Ein Tee kann mehrfach bewertet werden (z.B. mit anderer Zubereitung).

## 6. Vorrat

- Enthält **Zutaten und fertige Tees**.
- Menge in Gramm (0–100 000) optional: leer = „ohne Menge“, 0 = „aufgebraucht“.
- Je Nutzer höchstens ein Eintrag pro Zutat bzw. Tee, höchstens 1 000 Einträge; privat, ohne Audit-Log.
- Auch eigene private Tees. Löscht der Ersteller den Tee, verschwindet er aus dem Vorrat.
- Moderation: Zusammenführen hängt Vorratseinträge um (Mengen addiert, gedeckelt); ausgeblendete Einträge bleiben sichtbar, sind aber nur entfernbar.

## 7. Empfehlung

**Eingabe (Standard):** Klick-Oberfläche mit Stimmung, gewünschter Wirkung und Vorlieben.

**Ausgabe** – Nutzer wählt per Checkbox, was er will:
- [ ] Passende Tees aus dem eigenen Vorrat
- [ ] Neue Mischungen aus dem eigenen Vorrat
- [ ] Tees aus dem öffentlichen Katalog, die noch nicht im Vorrat sind (Bonus)

**Regeln:**
- Mischungen bestehen nur aus dem eigenen Vorrat.
- Fehlende Zutaten erscheinen nur als separater Bonus-Vorschlag, nie als Grundbaustein.
- Jede Empfehlung enthält eine **Begründung** und eine **Zubereitungsempfehlung** (Temperatur, Ziehzeit, Menge).
- Ausprobierte Mischungen werden als eigener Tee gespeichert (standardmäßig privat, optional veröffentlichen) und können bewertet werden.

**Technik:** RAG – Embeddings der Tees/Zutaten/Bewertungen in pgvector, Ähnlichkeitssuche, lokales LLM formuliert Vorschlag, Begründung und Zubereitung.

## 8. Mehrsprachigkeit

- Oberfläche: **Deutsch + Englisch** von Anfang an (`@nuxtjs/i18n`).
- Systemlisten (Eigenschaften, Stimmungen, Wirkungen): in allen Sprachen gepflegt.
- Katalog-Einträge: in der **Eingabesprache** gespeichert; Übersetzungen können ergänzt werden (Übersetzungstabelle, Fallback auf Originalsprache).

## 9. Architektur

```
Browser (Vuetify, mobile first)
        │
Nuxt (SSR + Nitro-Server = API)
  ├─ Auth, Rollen, Validierung, Rate-Limit
  ├─ CRUD: Katalog, Vorrat, Bewertungen, Historie
  ├─ Empfehlungs-Service ──► LLM-Provider-Schnittstelle ──► Ollama (LLM)
  │                     └──► Ollama (Embeddings)
  └─ Prisma ──► Postgres + pgvector
```

- **Kein n8n**, keine separate Backend-App – Nuxt-Server-Routen (`server/api/…`) sind das Backend.
- LLM hinter einer **Provider-Schnittstelle**, damit später z.B. auf Claude gewechselt werden kann.
- **Docker Compose** betreibt Postgres und Ollama (Ollama mit NVIDIA-GPU). Nuxt läuft in der Entwicklung direkt unter WSL (`npm run dev`); ein Container für Nuxt folgt mit dem Hosting.

## 10. Tech-Stack

| Bereich | Wahl |
|---|---|
| Framework | Nuxt (TypeScript) |
| UI | Vuetify, mobile first |
| DB | Postgres + pgvector |
| ORM | Prisma (Vektor-Spalten als `Unsupported("vector(768)")`, Suche per `$queryRaw`) |
| LLM | Ollama lokal, Modell per Config (ca. 7–8B, quantisiert; Ziel-GPU RTX 5050, 8 GB VRAM) |
| Embeddings | Ollama, z.B. `nomic-embed-text` (768 Dim.) |
| Validierung | zod |
| Logging | pino |
| Tests | Vitest (Unit) + API-Tests gegen Test-DB |
| CI | GitHub Actions |
| Betrieb | Lokal: Postgres + Ollama per Docker (GPU), Nuxt unter WSL; Hosting später |

## 11. Authentifizierung

- E-Mail + Passwort, gehasht mit **Argon2id**.
- Session per Cookie: `HttpOnly`, `Secure`, `SameSite`.
- Ohne Mailversand im MVP: vergessene Passwörter setzt ein Admin zurück.

## 12. Sicherheit

- Secrets nur in `.env` (nie im Repo), `.env.example` als Vorlage.
- Rate-Limiting auf Login und Registrierung.
- Serverseitige Validierung aller Eingaben.
- CSRF-Schutz.
- Security-Header (u.a. CSP).
- Dependency-Checks (Dependabot) in der CI.

## 13. Logging

- Strukturierte JSON-Logs mit **Request-ID**.
- **Audit-Log** in der DB: Login, Rollenänderung, Katalog-Bearbeitung, Zurücksetzen, Sperren.
- Keine sensiblen Daten in Logs (Passwörter, Tokens, Session-IDs).

## 14. Datenschutz (DSGVO)

- Nutzer kann sein **Konto löschen**.
- **Datenexport** der eigenen Daten (Bewertungen, Vorrat, private Tees).
- Bei Löschung bleiben öffentliche Beiträge erhalten, werden aber **anonymisiert**.

## 15. Tests & CI

- Vitest für Logik und Validierung.
- API-Tests gegen die Server-Routen mit eigener Test-Datenbank.
- GitHub Actions bei jedem Push auf `main` und jedem PR gegen `main` (Repo `dominik-kretschmer/tea-taste-helper`): Lint, Typecheck, Tests.
- Deploy-Schritt folgt, sobald Hosting feststeht.

## 16. Nicht im MVP (Nice-to-have)

- E-Mail-Bestätigung und Passwort-Reset per Mail
- Chat-Eingabe für Empfehlungen
- PWA (installierbar)
- E2E-Tests mit Playwright
- Nutzungslimits für LLM-Anfragen
- Hosting / Produktiv-Deploy
- Wechsel auf Cloud-LLM (z.B. Claude)

## 17. Umsetzungsreihenfolge (vertikale Slices)

| Nr. | Spec | Inhalt |
|---|---|---|
| 01 | `01-basis/` | Docker Compose (Postgres, Ollama mit GPU), Prisma, Logging, Fehlerbehandlung, Tests, CI, Vuetify- und i18n-Grundgerüst |
| 02 | `02-auth-rollen/` | Registrierung, Login, Sessions, Rollen, Admin-Bereich, CSRF, Security-Header |
| 03 | `03-zutaten/` | Zutaten-Katalog inkl. Historie & Übersetzungen |
| 04 | `04-tees/` | Tees, Anteile, privat/öffentlich |
| 05 | `05-moderation/` | Melden, Zurücksetzen, Sperren, Duplikate |
| 06 | `06-vorrat/` | Vorrat mit optionalen Mengen |
| 07 | `07-systemlisten/` | Eigenschaften, Stimmungen, Wirkungen |
| 08 | `08-bewertung/` | Bewertung mit Phasen, Eigenschaften, Zubereitung |
| 09 | `09-embeddings/` | Embeddings erzeugen & speichern (pgvector) |
| 10 | `10-empfehlung/` | Empfehlung, Mischungen, Begründung, Zubereitung |
| 11 | `11-dsgvo/` | Konto löschen, Export, Anonymisierung |

Querschnittliche Aufräum- und Fehlerbehebungen ohne eigenen Slice stehen in `00-chore/` (je Issue ein Unterordner `<nr>-<name>/` nach demselben Ablauf); die Übersicht ist `00-chore/README.md`.

Jede Feature-Spec ist ein Ordner `.claude/specs/<nr>-<name>/` nach dem Skill `spec-driven` und enthält:
- `requirements.md` – User Stories, Akzeptanzkriterien, Nicht im Umfang
- `design.md` – Datenmodell, API-Endpunkte, UI, Entscheidungen, Abdeckung der Akzeptanzkriterien
- `tasks.md` – Umsetzungsschritte inkl. Tests