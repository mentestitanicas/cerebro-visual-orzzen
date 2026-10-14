#!/bin/zsh
set -euo pipefail

REPO="$HOME/cerebro-visual-orzzen"
SOURCE="$HOME/Library/CloudStorage/GoogleDrive-orzzen.official@gmail.com/Mi unidad/CEREBRO MAESTRO ORZZEN/05_OPERACION/mapa/MAPA_CEREBRO_ORZZEN_DATOS.json"
TARGET="$REPO/data/mapa.json"
LOGDIR="$HOME/Library/Logs/orzzen"
LOG="$LOGDIR/map-sync.log"
LOCK="$HOME/.orzzen-map-sync.lock"

mkdir -p "$LOGDIR"
exec >>"$LOG" 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] inicio sync"

# Evita ejecuciones solapadas.
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] otra ejecución sigue activa; saliendo"
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

if [[ ! -d "$REPO/.git" ]]; then
  echo "ERROR: no existe repositorio en $REPO"
  exit 1
fi
if [[ ! -f "$SOURCE" ]]; then
  echo "ERROR: no existe fuente: $SOURCE"
  exit 1
fi

TMP="$(mktemp -t orzzen-map.XXXXXX).json"
trap 'rm -f "$TMP"; rmdir "$LOCK" 2>/dev/null || true' EXIT
/usr/bin/python3 - "$SOURCE" "$TMP" <<'PYCOPY'
import sys
src, dst = sys.argv[1], sys.argv[2]

with open(src, "rb") as fsrc:
    data = fsrc.read()

with open(dst, "wb") as fdst:
    fdst.write(data)
PYCOPY

# Valida JSON antes de publicar.
/usr/bin/python3 -m json.tool "$TMP" >/dev/null

# No publica si no cambió.
if cmp -s "$TMP" "$TARGET"; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] sin cambios"
  exit 0
fi

cd "$REPO"

# Mantiene el repositorio alineado con origin/main antes de escribir.
git fetch origin main >/dev/null 2>&1 || true
if ! git diff --quiet -- . ':!data/mapa.json' || ! git diff --cached --quiet; then
  echo "ERROR: hay cambios locales ajenos a data/mapa.json; no se publica para evitar pisarlos"
  git status --short
  exit 1
fi

# Si el remoto avanzó, intenta fast-forward limpio.
git pull --ff-only origin main

cp "$TMP" "$TARGET"
git add data/mapa.json

# Confirmación final: solo mapa.json debe estar staged.
STAGED="$(git diff --cached --name-only)"
if [[ "$STAGED" != "data/mapa.json" ]]; then
  echo "ERROR: staging inesperado: $STAGED"
  git reset
  exit 1
fi

STAMP="$(date '+%Y-%m-%d %H:%M:%S')"
git commit -m "Autoactualizar mapa ORZZEN $STAMP"
git push origin main

echo "[$(date '+%Y-%m-%d %H:%M:%S')] publicado correctamente"
