# Aufgaben: 02 – Docker-Dienste lauschen auf allen Netzwerkschnittstellen

> Phase 3 zu [design.md](design.md). Status: **freigegeben (2026-10-23)**

Reihenfolge:
- Erreichbarkeit prüfen → Compose ändern → Dokumentation → Abnahme.
- Commits `fix(00-chore/02): …` bzw. `docs(00-chore/02): …`, nur mit ausdrücklich genannten Pfaden.
- `docker compose up -d` startet die Dienste neu. Vorher mit der Session für 04-Tees abstimmen, weil deren Dev-Server und Tests kurz die DB verlieren.

- [x] 1. Erreichbarkeit über `127.0.0.1` unter WSL prüfen
  - Dateien: keine (nur Prüfung)
  - Erfüllt: offene Frage aus den Anforderungen, Grundlage für AK-1.2
  - Prüfung: Ports vorübergehend per lokaler `compose.override.yaml` auf `127.0.0.1:` gesetzt (`!override`), `docker compose up -d`, dann in WSL `pg_isready -h 127.0.0.1 -p 5432` und `curl -s 127.0.0.1:11434/api/version`, im Windows-Browser `http://localhost:8080`. Scheitert WSL: anhalten und mit dem Nutzer abstimmen (Ausweg `networkingMode=mirrored`).
  - Ergebnis: Ohne Override-Zwischenschritt direkt in `compose.yaml` geprüft (Rücknahme wäre einfach gewesen). Aus WSL: `127.0.0.1:5432` (SQL `SELECT 1`), `127.0.0.1:11434/api/version` → `0.40.8`, `127.0.0.1:8080` → 200. Aus Windows `http://localhost:8080` → 200. Kein Ausweg (`mirrored`) nötig.

- [x] 2. Ports in `compose.yaml` auf Loopback
  - Dateien: `compose.yaml`, `.gitignore` (`compose.override.yaml`)
  - Erfüllt: AK-1.1, AK-1.2
  - Prüfung: Test-Override aus Aufgabe 1 löschen. `docker compose up -d` und `docker compose ps` → `127.0.0.1:5432`, `127.0.0.1:11434`, `127.0.0.1:8080`. `npm run dev`, `curl localhost:3000/api/health` → 200 mit DB und Ollama „ok“, `npm test` grün. Aus Windows `curl <LAN-IP>:11434` → keine Verbindung.
  - Ergebnis: `docker compose ps` → `127.0.0.1:5432`, `127.0.0.1:11434`, `127.0.0.1:8080`. Über die WSL-Adresse `172.25.142.226` und die WLAN-Adresse `192.168.1.107` (aus Windows per TCP-Connect) sind alle drei Ports geschlossen. `compose.override.yaml` wird von Git ignoriert.

- [x] 3. README
  - Dateien: `README.md`
  - Erfüllt: AK-1.4
  - Prüfung: README sagt, dass die Dienste nur lokal erreichbar sind, und zeigt das `compose.override.yaml`-Beispiel mit `!override` samt Warnung zu Ollama ohne Authentifizierung.
  - Ergebnis: Beispiel mit `!override` per `docker compose config` geprüft: mit Override Ollama `0.0.0.0`, ohne `127.0.0.1`; Postgres bleibt `127.0.0.1`.

- [x] 4. Abnahme
  - Erfüllt: alle
  - Prüfung: AK-1.1 bis AK-1.4 einzeln vermerken. AK-1.3: `ci.yml` unverändert; CI-Lauf nach dem nächsten Push grün (Push nur nach Rücksprache).
  - Ergebnis (2026-10-23): AK-1.1 `docker compose ps` mit `127.0.0.1`; AK-1.2 voller Lauf `npm test` 311 von 312 grün (der eine Fehlschlag war ein Fehler im neuen Test von 03, siehe dort), `/api/health` meldet DB und Ollama `ok`; AK-1.4 README und `.gitignore`. AK-1.3: `ci.yml` unverändert; der CI-Lauf steht aus, bis der Nutzer pusht.
