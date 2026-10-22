# GPU für Ollama unter WSL2 einrichten

Ollama läuft im Container `ollama` und soll die NVIDIA-GPU nutzen. Zuerst prüfen, was schon funktioniert:

```bash
bash scripts/check-gpu.sh
```

Das Skript ändert nichts. Für jeden Schritt, der `FEHLT` meldet, den passenden Abschnitt unten abarbeiten und das Skript danach erneut ausführen. Befehle mit `sudo` führst du selbst aus.

Welche Abschnitte du brauchst, hängt davon ab, wie Docker läuft:

| Docker-Variante | Erkennbar an (`docker info`) | Nötige Abschnitte |
|---|---|---|
| **Docker Desktop** (Windows) mit WSL2-Backend | `Operating System: Docker Desktop` | 1, 4 |
| **Docker Engine** direkt in der WSL-Distribution | z.B. `Operating System: Ubuntu …` | 1, 2, 3, 4 |

## 1. Treiber

Der NVIDIA-Treiber wird **nur unter Windows** installiert. WSL2 reicht ihn automatisch durch.

1. Unter Windows den aktuellen Game-Ready- oder Studio-Treiber für die GPU installieren (nvidia.com/drivers oder NVIDIA App).
2. **Keinen** Linux-NVIDIA-Treiber in WSL installieren (`nvidia-driver-*`), denn das überschreibt die durchgereichte Bibliothek.
3. WSL neu starten: in PowerShell `wsl --shutdown`, dann das WSL-Terminal neu öffnen.
4. Prüfen:

   ```bash
   nvidia-smi -L    # erwartet: GPU 0: NVIDIA GeForce RTX 5050 …
   ```

## Docker

Meldet das Skript „Docker ist nicht erreichbar“:
- **Docker Desktop:** Docker Desktop unter Windows starten. Dann unter *Settings → Resources → WSL integration* die Integration für diese Distribution einschalten.
- **Docker Engine:** `sudo service docker start`

## 2. Container Toolkit

Nur für die **Docker Engine** in WSL nötig. Docker Desktop bringt den GPU-Support selbst mit.

```bash
# Paketquelle von NVIDIA einrichten
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Toolkit installieren
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

nvidia-ctk --version
```

## 3. Docker konfigurieren

Nur für die **Docker Engine** in WSL nötig:

```bash
sudo nvidia-ctk runtime configure --runtime=docker   # trägt die Runtime in /etc/docker/daemon.json ein
sudo service docker restart                          # bzw. sudo systemctl restart docker, wenn systemd aktiv ist
docker info | grep -i runtimes                       # erwartet: … nvidia …
```

Bei **Docker Desktop** ist die Runtime `nvidia` bereits vorhanden. Fehlt sie trotzdem:
1. Docker Desktop aktualisieren.
2. Prüfen, dass unter *Settings → General* „Use the WSL 2 based engine“ aktiv ist.

## 4. Prüfen

```bash
docker run --rm --gpus all ubuntu:24.04 nvidia-smi -L
```

Erwartet wird dieselbe Zeile wie in Abschnitt 1. Danach mit GPU starten und prüfen, ob Ollama die GPU sieht:

```bash
docker compose up -d
docker compose exec ollama nvidia-smi
```

## Ohne GPU

Ist keine GPU verfügbar, läuft Ollama auch auf der CPU. Das ist langsamer, reicht aber für die Entwicklung der Basis.

```bash
docker compose -f compose.yaml -f compose.cpu.yaml up -d
```

## Häufige Fehler

| Meldung | Ursache / Lösung |
|---|---|
| `could not select device driver "nvidia" with capabilities: [[gpu]]` | Runtime fehlt → Abschnitt 3 (Engine) bzw. Docker Desktop aktualisieren |
| `nvidia-smi: command not found` in WSL | Windows-Treiber fehlt oder ist zu alt → Abschnitt 1, danach `wsl --shutdown` |
| `Failed to initialize NVML: GPU access blocked by the operating system` | Linux-Treiber in WSL installiert → `sudo apt-get remove --purge 'nvidia-driver-*'`, dann `wsl --shutdown` |
| Ollama läuft, nutzt aber die CPU | In `docker compose logs ollama` nach `inference compute` suchen; fehlt dort die GPU, ist der Container ohne `deploy`-Block gestartet (z.B. mit `compose.cpu.yaml`) |
