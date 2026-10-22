# 01 – Basis

> Feature-Spec zu [00 – Overview](../00%20–%20Overview:%20tea-taste-helper.md), Slice 01. Phase 1: Anforderungen.
> Status: **freigegeben (2026-10-22)**, angepasst am 2026-10-22: bestehende `compose.yaml` berücksichtigt (Dienstname `postgres`, `adminer` und `ollama-pull` bleiben, n8n entfällt)

## Ziel

Das Projekt ist noch der leere Nuxt-Starter. Diese Spec legt das technische Fundament, auf dem alle weiteren Slices (02–11) aufbauen: Docker-Umgebung für Postgres und Ollama (mit GPU), Datenbank mit Prisma, Logging, einheitliche Fehlerbehandlung, Tests, CI und das UI-/i18n-Grundgerüst. Fachliche Features enthält sie nicht.

## User Stories

- **US-1:** Als Entwickler möchte ich Postgres + pgvector und Ollama mit einem Befehl per Docker starten und Nuxt direkt unter WSL entwickeln, damit ich ohne manuelle Einrichtung und mit schnellem Hot Reload arbeiten kann.
- **US-2:** Als Entwickler möchte ich die Datenbank über Prisma mit versionierten Migrationen verwalten, damit das Schema nachvollziehbar und reproduzierbar ist.
- **US-3:** Als Entwickler möchte ich alle Konfiguration und Secrets über Umgebungsvariablen setzen, damit nichts Vertrauliches im Repo landet.
- **US-4:** Als Betreiber möchte ich strukturierte Logs mit Request-ID, damit ich Anfragen über alle Logzeilen hinweg verfolgen kann.
- **US-5:** Als Frontend-Entwickler möchte ich, dass alle API-Fehler im selben Format zurückkommen, damit ich sie einheitlich behandeln kann.
- **US-6:** Als Betreiber möchte ich einen Health-Endpunkt, damit ich sehe, ob App, Datenbank und Ollama erreichbar sind.
- **US-7:** Als Nutzer möchte ich die Oberfläche auf Deutsch oder Englisch sehen und sie auf dem Handy gut bedienen können.
- **US-8:** Als Entwickler möchte ich Unit- und API-Tests gegen eine eigene Test-Datenbank ausführen, damit Tests keine Entwicklungsdaten verändern.
- **US-9:** Als Entwickler möchte ich, dass bei jedem Push und PR automatisch Lint, Typecheck und Tests laufen, damit Fehler früh auffallen.
- **US-10:** Als Entwickler möchte ich, dass Ollama die NVIDIA-GPU (RTX 5050) nutzt und ich eine Anleitung bzw. ein Prüfskript für die nötige Einrichtung unter WSL habe, damit LLM-Anfragen schnell genug sind.

## Akzeptanzkriterien

### US-1 – Docker Compose & lokale Entwicklung
- **AK-1.1:** WENN `docker compose up -d` im Projektordner ausgeführt wird, DANN starten die Dienste `postgres` (pgvector, Datenbanken `tea` und `tea_test`), `ollama`, `ollama-pull` und `adminer`, aber kein `n8n`. Postgres ist auf `localhost:5432`, Ollama auf `localhost:11434` und Adminer auf `localhost:8080` erreichbar.
- **AK-1.2:** WENN die Container neu gestartet werden, DANN bleiben Datenbankinhalte und geladene Ollama-Modelle erhalten (benannte Volumes).
- **AK-1.3:** WENN `npm run dev` unter WSL läuft und eine Datei unter `app/` oder `server/` geändert wird, DANN übernimmt der Dev-Server die Änderung ohne Neustart (Hot Reload), und `http://localhost:3000` liefert die Startseite aus.
- **AK-1.4:** WENN `docker compose ps` ausgeführt wird, nachdem `postgres` hochgefahren ist, DANN steht `postgres` auf `healthy` (Healthcheck per `pg_isready`).
- **AK-1.5:** Die README beschreibt den Start in dieser Reihenfolge: `docker compose up -d` → `npm install` → `npm run db:migrate` → `npm run dev`.

### US-2 – Prisma
- **AK-2.1:** WENN die Migrationen angewendet werden (`npx prisma migrate deploy`), DANN ist die Postgres-Extension `vector` aktiv (`SELECT extname FROM pg_extension` enthält `vector`).
- **AK-2.2:** WENN Server-Code den Prisma-Client nutzt, DANN kommt er aus einer einzigen gemeinsamen Instanz (kein neuer Client pro Request).
- **AK-2.3:** WENN `npm run db:migrate`, `npm run db:reset` bzw. `npm run db:studio` aufgerufen wird, DANN wird die jeweilige Prisma-Aktion ausgeführt.

### US-3 – Konfiguration
- **AK-3.1:** WENN das Repo frisch geklont ist, DANN gibt es eine `.env.example` mit allen benötigten Variablen und Beispielwerten, aber ohne echte Secrets.
- **AK-3.2:** WENN eine Pflicht-Variable fehlt oder ungültig ist, DANN bricht der Server beim Start mit einer Meldung ab, die den Namen der Variable nennt (Prüfung per zod).
- **AK-3.3:** WENN `git status` ausgeführt wird, DANN ist `.env` nicht als zu committende Datei aufgeführt.

### US-4 – Logging
- **AK-4.1:** WENN eine Anfrage an `/api/*` eingeht, DANN wird eine Logzeile als JSON (pino) mit Methode, Pfad, Statuscode, Dauer und Request-ID geschrieben.
- **AK-4.2:** WENN eine Anfrage eingeht, DANN enthält die Antwort einen Header `X-Request-Id`, und derselbe Wert steht in allen Logzeilen dieser Anfrage.
- **AK-4.3:** WENN Request-Daten Felder wie `password`, `token`, `authorization` oder `cookie` enthalten, DANN erscheinen deren Werte im Log nur als `[REDACTED]`.
- **AK-4.4:** WENN `LOG_LEVEL` gesetzt ist, DANN loggt der Server nur Einträge ab diesem Level.

### US-5 – Fehlerbehandlung
- **AK-5.1:** WENN eine API-Route einen Fehler erzeugt, DANN hat die Antwort das Format `{ "error": { "code": string, "message": string, "requestId": string, "details"?: unknown } }`.
- **AK-5.2:** WENN eine Eingabe die zod-Validierung nicht besteht, DANN antwortet der Server mit Status `400`, Code `VALIDATION_ERROR` und den betroffenen Feldern in `details`.
- **AK-5.3:** WENN ein unerwarteter Fehler auftritt, DANN antwortet der Server mit Status `500` und Code `INTERNAL_ERROR`, ohne Stacktrace oder interne Details in der Antwort; der Stacktrace steht nur im Log.
- **AK-5.4:** WENN eine unbekannte Route unter `/api/` aufgerufen wird, DANN antwortet der Server mit `404` im selben Fehlerformat.

### US-6 – Health
- **AK-6.1:** WENN `GET /api/health` aufgerufen wird und DB und Ollama erreichbar sind, DANN antwortet der Server mit `200` und `{ "status": "ok", "db": "ok", "ollama": "ok" }`.
- **AK-6.2:** WENN die DB oder Ollama nicht erreichbar ist, DANN antwortet der Server mit `503`, und der betroffene Dienst steht auf `"error"`.

### US-7 – UI & i18n
- **AK-7.1:** WENN die Startseite aufgerufen wird, DANN zeigt sie statt `NuxtWelcome` ein Vuetify-Grundlayout (App-Bar mit App-Name und Sprachumschalter, Inhaltsbereich).
- **AK-7.2:** WENN der Browser Deutsch bevorzugt bzw. `/` aufgerufen wird, DANN erscheint die Oberfläche auf Deutsch; unter `/en` auf Englisch.
- **AK-7.3:** WENN der Nutzer im Sprachumschalter die Sprache wechselt, DANN ändern sich alle sichtbaren Texte, und die Wahl bleibt beim Neuladen erhalten.
- **AK-7.4:** WENN ein UI-Text im Code verwendet wird, DANN kommt er aus den Sprachdateien (`de`, `en`); beide Dateien haben dieselben Schlüssel.
- **AK-7.5:** WENN die Startseite bei 360 px Breite angezeigt wird, DANN gibt es keinen horizontalen Scrollbalken, und alle Bedienelemente sind erreichbar.

### US-8 – Tests
- **AK-8.1:** WENN `npm test` ausgeführt wird, DANN laufen alle Vitest-Tests (Unit und API) und der Befehl endet mit Exit-Code 0.
- **AK-8.2:** WENN API-Tests laufen, DANN nutzen sie eine eigene Test-Datenbank (`DATABASE_URL` der Testumgebung), nicht die Entwicklungsdatenbank.
- **AK-8.3:** Es gibt mindestens Tests für: Env-Validierung (AK-3.2), Fehlerformat (AK-5.1–5.3) und `/api/health` (AK-6.1).

### US-9 – CI
- **AK-9.1:** WENN auf `main` gepusht oder ein PR gegen `main` geöffnet wird (Repo `dominik-kretschmer/tea-taste-helper`), DANN führt GitHub Actions nacheinander `lint`, `typecheck` und `test` aus (Tests mit Postgres-Service-Container), und ein Fehler in einem Schritt lässt den Lauf fehlschlagen.
- **AK-9.2:** WENN `npm run lint` bzw. `npm run typecheck` lokal ausgeführt wird, DANN prüft es dieselben Regeln wie die CI.
- **AK-9.3:** Dependabot ist für npm-Pakete und GitHub Actions konfiguriert (wöchentlich).

### US-10 – GPU für Ollama
- **AK-10.1:** WENN `scripts/check-gpu.sh` ausgeführt wird, DANN prüft es nacheinander Treiber in WSL (`nvidia-smi`), NVIDIA Container Toolkit, Docker-Runtime `nvidia` und GPU-Zugriff aus einem Container, und meldet je Schritt `OK` oder `FEHLT` mit dem passenden Abschnitt der Anleitung. Bei Docker Desktop wird der Toolkit-Schritt als „nicht nötig“ übersprungen, weil Docker Desktop den GPU-Support mitbringt.
- **AK-10.2:** Es gibt eine Anleitung `docs/gpu-setup.md` mit den Einrichtungsschritten für Docker Desktop und für eine Docker Engine mit NVIDIA Container Toolkit unter WSL2 (Ubuntu), die sich Schritt für Schritt abarbeiten lässt. Ausgeführt werden die Befehle vom Entwickler selbst (sie brauchen `sudo`).
- **AK-10.3:** WENN die GPU eingerichtet ist und `docker compose up -d` läuft, DANN zeigt `docker compose exec ollama nvidia-smi` die RTX 5050.
- **AK-10.4:** WENN keine GPU verfügbar ist, DANN lässt sich Ollama trotzdem starten (CPU-Betrieb über eine Compose-Override-Datei oder ein Profil), damit z.B. die CI nicht von einer GPU abhängt.

## Nicht im Umfang

- Authentifizierung, Rollen, Sessions, CSRF, Rate-Limiting, Security-Header (CSP u.a.) → Slice 02
- Fachliche Datenmodelle (Zutaten, Tees, …) – das Prisma-Schema enthält in 01 nur die pgvector-Extension
- LLM-Provider-Schnittstelle, Embeddings, Herunterladen weiterer Ollama-Modelle (über das bestehende `nomic-embed-text` hinaus) → Slices 09/10
- Audit-Log in der DB → mit den ersten auditpflichtigen Aktionen (Slice 02)
- Nuxt im Docker-Container (Dev und Production-Image), Hosting, Deploy-Schritt in der CI
- Übersetzungstabellen für Katalog-Einträge → Slice 03

## Entscheidungen

- Nuxt läuft in der Entwicklung direkt unter WSL (`npm run dev`); Docker Compose enthält `postgres`, `ollama`, `ollama-pull` und `adminer`.
- Die bestehende `compose.yaml` wird angepasst; n8n entfällt, das Postgres-Volume wird neu angelegt.
- Ollama nutzt die GPU; das Einrichten bereitet 01 vor (Anleitung + Prüfskript), die Installation führt der Entwickler selbst aus.
- Security-Header kommen zusammen mit CSRF in Slice 02.
- CI läuft auf `main` im GitHub-Repo `dominik-kretschmer/tea-taste-helper`.
- Specs liegen als Ordner `.claude/specs/<nr>-<name>/` mit `requirements.md`, `design.md`, `tasks.md`.

## Offene Fragen

- keine
