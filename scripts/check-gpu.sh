#!/usr/bin/env bash
# Prüft, ob Docker unter WSL2 die NVIDIA-GPU an Container weitergeben kann.
# Ändert nichts am System und braucht kein sudo. Anleitung: docs/gpu-setup.md
set -u

DOC="docs/gpu-setup.md"
TEST_IMAGE="ubuntu:24.04"
failed=0

ok()      { printf '  \033[32mOK\033[0m     %s\n' "$1"; }
missing() { printf '  \033[31mFEHLT\033[0m  %s\n         → %s#%s\n' "$1" "$DOC" "$2"; failed=1; }
skip()    { printf '  \033[33m--\033[0m     %s\n' "$1"; }

echo "GPU-Prüfung für Docker unter WSL2"

# 1. Windows-Treiber, in WSL sichtbar über nvidia-smi
if gpu=$(nvidia-smi -L 2>/dev/null) && [ -n "$gpu" ]; then
  ok "1. Treiber: ${gpu%% (UUID*}"
else
  missing "1. Treiber: nvidia-smi findet keine GPU" "1-treiber"
fi

# Docker erreichbar? Ohne Docker sind die Schritte 2–4 nicht prüfbar.
if ! docker_os=$(docker info --format '{{.OperatingSystem}}' 2>/dev/null); then
  missing "Docker ist nicht erreichbar (läuft Docker Desktop bzw. der Docker-Dienst?)" "docker"
  exit 1
fi

# 2. NVIDIA Container Toolkit – nur für eine eigene Docker Engine in WSL nötig
if [[ "$docker_os" == "Docker Desktop" ]]; then
  skip "2. Container Toolkit: nicht nötig (Docker Desktop bringt GPU-Support mit)"
elif command -v nvidia-ctk >/dev/null 2>&1; then
  ok "2. Container Toolkit: $(nvidia-ctk --version 2>/dev/null | head -n1)"
else
  missing "2. Container Toolkit: nvidia-ctk nicht installiert" "2-container-toolkit"
fi

# 3. Docker kennt die Runtime nvidia
if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q '"nvidia"'; then
  ok "3. Docker-Runtime: nvidia vorhanden ($docker_os)"
else
  missing "3. Docker-Runtime: nvidia fehlt ($docker_os)" "3-docker-konfigurieren"
fi

# 4. GPU aus einem Container heraus sichtbar
if out=$(docker run --rm --gpus all "$TEST_IMAGE" nvidia-smi -L 2>&1) && grep -q '^GPU' <<<"$out"; then
  ok "4. Container: $(grep -m1 '^GPU' <<<"$out" | sed 's/ (UUID.*//')"
else
  missing "4. Container: keine GPU sichtbar ($(tail -n1 <<<"$out"))" "4-pruefen"
fi

echo
if [ "$failed" -eq 0 ]; then
  echo "Alles bereit: Ollama kann die GPU nutzen (docker compose up -d)."
else
  echo "Nicht alle Schritte erfüllt – siehe $DOC. Ohne GPU: docker compose -f compose.yaml -f compose.cpu.yaml up -d"
fi
exit "$failed"
