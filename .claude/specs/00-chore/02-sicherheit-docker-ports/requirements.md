# 02 – Docker-Dienste lauschen auf allen Netzwerkschnittstellen

> Chore-Issue zu [00-chore](../README.md). Phase 1: Anforderungen. Status: **freigegeben (2026-10-23)**

## Befund

`compose.yaml` veröffentlicht Ports ohne Adresse (`"5432:5432"` usw.). `docker compose ps` zeigt `0.0.0.0:5432`, `0.0.0.0:11434`, `0.0.0.0:8080`. Damit sind aus dem lokalen Netz erreichbar, soweit die Windows-Firewall es zulässt:

- Postgres (Passwort aus `.env`),
- Ollama – **ohne jede Authentifizierung** (Modelle laden/löschen, GPU nutzen),
- Adminer (Login-Maske für die DB).

Die App selbst läuft unter WSL und braucht nur `localhost`.

## Ziel

Die Entwicklungsdienste sind nur vom eigenen Rechner erreichbar.

## User Stories

- **US-1:** Als Entwickler möchte ich, dass DB, Ollama und Adminer nur lokal erreichbar sind, damit niemand im selben Netz (z.B. WLAN) darauf zugreifen kann.

## Akzeptanzkriterien

- **AK-1.1:** WENN `docker compose up -d` läuft, DANN zeigt `docker compose ps` für Postgres, Ollama und Adminer `127.0.0.1:<port>` statt `0.0.0.0`.
- **AK-1.2:** WENN die Dienste so laufen, DANN funktionieren `npm run dev`, `npm test` (API-Tests) und `/api/health` unverändert.
- **AK-1.3:** Die CI (Service-Container in GitHub Actions) bleibt unverändert grün.
- **AK-1.4:** Die README nennt, wie man einen Dienst bei Bedarf bewusst im Netz freigibt.

## Nicht im Umfang

- Passwort oder Proxy für Ollama.
- Produktiv-Betrieb (folgt mit dem Hosting).

## Offene Fragen

- Erreicht die App unter WSL die Dienste über `127.0.0.1`, wenn Docker Desktop die Ports nur auf dem Windows-Loopback veröffentlicht? Bei Docker Desktop mit WSL-Integration ja; wird in der Umsetzung geprüft, sonst Alternative im Design.
