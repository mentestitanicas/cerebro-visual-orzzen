#!/bin/zsh
set -euo pipefail

REPO="$HOME/cerebro-visual-orzzen"
SCRIPT="$REPO/scripts/sync_orzzen_map.sh"
PLIST="$HOME/Library/LaunchAgents/com.orzzen.visual-map-sync.plist"
LABEL="com.orzzen.visual-map-sync"
UID_NUM="$(id -u)"

if [[ ! -d "$REPO/.git" ]]; then
  echo "ERROR: no existe $REPO"
  exit 1
fi

cd "$REPO"
git pull --ff-only origin main
chmod +x "$SCRIPT"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/orzzen"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>${SCRIPT}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>StandardOutPath</key>
  <string>${HOME}/Library/Logs/orzzen/map-sync-launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${HOME}/Library/Logs/orzzen/map-sync-launchd.err.log</string>
</dict>
</plist>
PLIST

plutil -lint "$PLIST"
launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/${UID_NUM}" "$PLIST"
launchctl enable "gui/${UID_NUM}/${LABEL}"
launchctl kickstart -k "gui/${UID_NUM}/${LABEL}"

echo "INSTALADO: actualización automática cada 300 segundos (5 minutos)."
echo "Estado: launchctl print gui/${UID_NUM}/${LABEL}"
echo "Log: $HOME/Library/Logs/orzzen/map-sync.log"
