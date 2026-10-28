#!/usr/bin/env bash
# Install the MLX worker on a Mac as a launchd agent (runs while logged in,
# pauses when the Mac sleeps; the router notices from the missing heartbeat).
#   LOCAL_STT_REDIS_PASSWORD=... ./install.sh       (from this directory)
# Uninstall: launchctl bootout gui/$(id -u)/com.macro.local-stt-worker
set -euo pipefail
: "${LOCAL_STT_REDIS_PASSWORD:?export the queue password first}"
here="$(cd "$(dirname "$0")" && pwd)"
src="$(cd "$here/../.." && pwd)"           # services/transcription
home="$HOME/.local/share/macro-local-stt"
label=com.macro.local-stt-worker
mkdir -p "$home/logs"
rsync -a --delete "$src/local_stt/" "$home/local_stt/"
cp "$src"/requirements-local-stt*.txt "$home/"
uv venv --allow-existing --python 3.12 "$home/venv"
VIRTUAL_ENV="$home/venv" uv pip install -q -r "$home/requirements-local-stt-mlx.txt"
umask 077
printf "MACRO_LOCAL_STT_REDIS_URL='redis://:%s@100.81.201.84:6385/0'\n" "$LOCAL_STT_REDIS_PASSWORD" > "$home/env"
sed -e "s#@HOME@#$home#g" "$here/$label.plist" > "$HOME/Library/LaunchAgents/$label.plist"
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/$label.plist"
echo "started; logs in $home/logs"
