#!/bin/bash
# Bring the public-mode instance `staging` (port base 43000) to a build.
#
#   staging.sh <tree> <binaries-dir> <frontend-bundle>
#   staging.sh --env-only     (write ~/macro-build/gate/staging.env if missing)
#   staging.sh --start <tree> (start it again on the build it last ran)
#
# First run: `stack up --fresh`. Later runs: `stack update --frontend`, then a
# proxy restart, exactly as tooling/self-host/deploy.sh does in production, so
# the gate also exercises migrations on existing data. A LiveKit dev server
# runs as `macro-staging-livekit`, reachable as livekit.localhost:7880 from the
# services (network alias) and the browser (Chrome maps *.localhost to
# loopback and treats it as a secure context).
set -euo pipefail
TREE=${1:?} OUT=${2:-} FE=${3:-}
G=$HOME/macro-build/gate PB=43000 ORIGIN=https://localhost:43009
LK=macro-staging-livekit LK_URL=http://livekit.localhost:7880 LK_KEY=gatekey
export MACRO_FRONTEND_BUNDLE=$FE

if [ ! -s "$G/livekit.secret" ]; then (umask 077; openssl rand -hex 24 > "$G/livekit.secret"); fi
LK_SECRET=$(cat "$G/livekit.secret")
if [ ! -s "$G/staging.env" ]; then
  (umask 077; python3 "$(dirname "$(readlink -f "$0")")/staging-env.py" "$ORIGIN" "$LK_URL" "$LK_KEY" "$LK_SECRET" > "$G/staging.env.tmp")
  mv "$G/staging.env.tmp" "$G/staging.env"
fi
[ "$TREE" = --env-only ] && exit 0
if [ "$TREE" = --start ]; then
  \cd "${2:?usage: staging.sh --start <tree>}"
  docker ps --format '{{.Names}}' | grep -qx macro-staging-proxy-1 && { echo "staging already runs"; exit 0; }
  mkdir -p infra/local/generated/staging
  [ -f infra/local/generated/staging/stack.json ] || cp "$G/staging.stack.json" infra/local/generated/staging/stack.json
  MACRO_FRONTEND_BUNDLE=$(cat "$G/staging.last-fe") just stack start --instance staging --port-base $PB --no-doppler \
    --env-file "$G/staging.env" --binaries-dir "$(cat "$G/staging.last-bins")"
  docker network connect --alias livekit.localhost macro-staging_services $LK 2>/dev/null || true
  exit 0
fi

\cd "$TREE"
COMMON=(--instance staging --port-base $PB --no-doppler --env-file "$G/staging.env" --binaries-dir "$OUT")
if [ -f infra/local/generated/staging/stack.json ] || [ -f "$G/staging.stack.json" ]; then
  # stack.json lives in the tree that ran `up`; $G/staging.stack.json is the
  # copy from the last bring-up, whichever tree that ran in.
  mkdir -p infra/local/generated/staging
  [ -f "$G/staging.stack.json" ] && cp "$G/staging.stack.json" infra/local/generated/staging/stack.json
  # The gate stops staging (down --keep-data) while the suites run: Docker has
  # few address pools. Start it on the build it ran before, then update, so the
  # update path is the one production takes.
  if ! docker ps --format '{{.Names}}' | grep -qx macro-staging-proxy-1; then
    echo "== stack start (previous build)"
    MACRO_FRONTEND_BUNDLE=$(cat "$G/staging.last-fe") just stack start --instance staging --port-base $PB --no-doppler \
      --env-file "$G/staging.env" --binaries-dir "$(cat "$G/staging.last-bins")"
  fi
  echo "== stack update"
  just stack update "${COMMON[@]}" --frontend
  docker restart macro-staging-proxy-1 >/dev/null
else
  echo "== stack up --fresh"
  just stack up "${COMMON[@]}" --traces off --fresh
fi
cp infra/local/generated/staging/stack.json "$G/staging.stack.json"
echo "$OUT" > "$G/staging.last-bins"; echo "$FE" > "$G/staging.last-fe"
# As in production: Macro's own telemetry proxy stays off.
docker update --restart no macro-staging-analytics_proxy-1 >/dev/null 2>&1 && docker stop macro-staging-analytics_proxy-1 >/dev/null 2>&1 || true

if ! docker ps --format '{{.Names}}' | grep -qx $LK; then
  docker rm -f $LK >/dev/null 2>&1 || true
  docker run -d --name $LK --restart unless-stopped \
    -p 127.0.0.1:7880:7880 -p 127.0.0.1:7881:7881 -p 127.0.0.1:7882:7882/udp \
    livekit/livekit-server:latest --dev --bind 0.0.0.0 --node-ip 127.0.0.1 \
    --keys "$LK_KEY: $LK_SECRET" >/dev/null
fi
docker network connect --alias livekit.localhost macro-staging_services $LK 2>/dev/null || true

for i in $(seq 1 60); do
  code=$(curl -sk -o /dev/null -w '%{http_code}' $ORIGIN/app/ || true)
  [ "$code" = 200 ] && { echo "staging up ($ORIGIN)"; exit 0; }
  sleep 5
done
echo "staging did not answer 200 on $ORIGIN/app/" >&2; exit 1
