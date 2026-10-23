# Design: 02 – Docker-Dienste lauschen auf allen Netzwerkschnittstellen

> Phase 2 zu [requirements.md](requirements.md). Status: **freigegeben (2026-10-23)**

## Überblick

In `compose.yaml` bekommen die drei veröffentlichten Ports die Adresse `127.0.0.1`. Wer einen Dienst doch im Netz braucht, legt sich eine eigene, nicht eingecheckte `compose.override.yaml` an; Docker Compose liest sie automatisch.

`ollama-pull` spricht Ollama über das interne Compose-Netz an (`OLLAMA_HOST: ollama:11434`) und ist nicht betroffen, ebenso Adminer → Postgres. Die CI nutzt eigene Service-Container in GitHub Actions und nicht `compose.yaml`.

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|---|---|---|
| `compose.yaml` | geändert | `ports` mit `127.0.0.1:` |
| `.gitignore` | geändert | `compose.override.yaml` ignorieren |
| `README.md` | geändert | Hinweis „nur lokal erreichbar“ und wie man freigibt (AK-1.4) |

## Konfiguration

```yaml
# compose.yaml
  postgres:
    ports:
      # nur vom eigenen Rechner; Freigabe im Netz siehe README
      - "127.0.0.1:5432:5432"
  ollama:
    ports:
      - "127.0.0.1:11434:11434"
  adminer:
    ports:
      - "127.0.0.1:8080:8080"
```

README, Beispiel für eine bewusste Freigabe (`!override` ersetzt die Liste statt sie zu ergänzen, ab Compose 2.24):

```yaml
# compose.override.yaml (nicht einchecken)
services:
  ollama:
    ports: !override
      - "0.0.0.0:11434:11434"
```

Dazu der Hinweis: Ollama hat keine Authentifizierung; nur in vertrauenswürdigen Netzen freigeben.

## Erreichbarkeit unter WSL (offene Frage aus den Anforderungen)

Prüfung als erster Umsetzungsschritt, bevor etwas anderes geändert wird:

1. `docker compose up -d`, dann in WSL `pg_isready -h 127.0.0.1 -p 5432` bzw. `curl -s 127.0.0.1:11434/api/version`, im Windows-Browser `http://localhost:8080`.
2. Von einem zweiten Gerät im selben Netz (oder `curl <LAN-IP-des-Rechners>:11434` aus Windows) → muss scheitern.

Erwartung: Mit Docker Desktop und WSL-Integration leitet Docker Desktop Ports, die auf `127.0.0.1` veröffentlicht sind, auch in die WSL-Distribution weiter; mit Docker Engine direkt in WSL ist `127.0.0.1` ohnehin das WSL-Loopback, das Windows über die WSL-Localhost-Weiterleitung erreicht.

Falls Schritt 1 unter WSL scheitert: anhalten, mit dem Nutzer abstimmen. Ausweg wäre WSL im Netzwerkmodus `mirrored` (`.wslconfig`), dokumentiert in der README; `compose.yaml` bliebe gleich.

## Entscheidungen

- **`127.0.0.1` fest in `compose.yaml`** – sicherer Standard für alle, die das Repo klonen. – Verworfen: Adresse über eine Variable (`${BIND_ADDRESS:-127.0.0.1}`); mehr Konfiguration für einen Fall, den `compose.override.yaml` schon abdeckt.
- **Freigabe über `compose.override.yaml`** – Compose-Standardmechanismus, wird automatisch gelesen, lokal und nicht eingecheckt. – Verworfen: Ports ganz entfernen und nur über das Compose-Netz arbeiten (die App läuft außerhalb von Docker und braucht die Ports).
- **Kein IPv6-Loopback (`[::1]`)** – Node löst `localhost` auf `127.0.0.1` bzw. versucht beide; `DATABASE_URL` und `OLLAMA_URL` nutzen `localhost`. Prüfung in Schritt 1 deckt das ab.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|---|---|
| AK-1.1 | `compose.yaml`; Prüfung `docker compose ps` |
| AK-1.2 | Prüfung WSL-Erreichbarkeit (oben), danach `npm run dev`, `npm test`, `curl localhost:3000/api/health` |
| AK-1.3 | `ci.yml` unverändert (eigene Service-Container); CI-Lauf nach dem Push |
| AK-1.4 | `README.md` mit `compose.override.yaml`-Beispiel, `.gitignore` |
