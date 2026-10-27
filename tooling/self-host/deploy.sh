#!/bin/bash
# Deploy or update self-hosted Macro on this server.
#   deploy.sh <commit-sha> update|status|down    (up --fresh WIPES all data)
# Images come from Docker Hub (built on luka-mini); nothing is compiled here.
# /srv/macro-deploy/macro.env (0600) is rendered from 1Password
# "Production Macro Environment" and piped in over SSH; never commit it.
set -euo pipefail
SHA=${1:?commit sha}; CMD=${2:-up}
D=/srv/macro-deploy; R=/srv/macro; INSTANCE=prod; PORT_BASE=47000
# `stack up` runs `compose down -v` and restores the empty init snapshot: it
# WIPES every account and document. Only allowed with an explicit --fresh.
if [ "$CMD" = up ] && [ "${3:-}" != --fresh ]; then
  echo "refusing: 'up' wipes all Macro data on this server. Use 'update', or 'up --fresh' to start over." >&2; exit 2
fi
if [ "$CMD" = update ] && ! sudo test -f $R/infra/local/generated/$INSTANCE/stack.json; then
  echo "refusing: no stack.json, 'update' would fall back to a wiping 'up'." >&2; exit 2
fi
git -C $R fetch -q origin && git -C $R checkout -q --detach "$SHA"
for img in macro-rust-services macro-toolbox macro-frontend; do sudo docker pull -q youriheuvel/$img:$SHA >/dev/null; done
if [ ! -d $D/bin/$SHA ]; then
  mkdir -p $D/bin/$SHA; id=$(sudo docker create youriheuvel/macro-rust-services:$SHA)
  sudo docker cp -q $id:/app/out/. $D/bin/$SHA/; sudo docker rm -f $id >/dev/null
fi
if [ ! -f $D/frontend/$SHA/index.html ]; then
  mkdir -p $D/frontend/$SHA; id=$(sudo docker create youriheuvel/macro-frontend:$SHA true)
  sudo docker cp -q $id:/frontend/. $D/frontend/$SHA/; sudo docker rm -f $id >/dev/null
fi
ARGS=(--instance $INSTANCE)
case $CMD in
  up)     ARGS=(up "${ARGS[@]}" --fresh --port-base $PORT_BASE --no-doppler --env-file $D/macro.env --binaries-dir $D/bin/$SHA) ;;
  update) ARGS=(update "${ARGS[@]}" --port-base $PORT_BASE --no-doppler --env-file $D/macro.env --binaries-dir $D/bin/$SHA --frontend) ;;
  start)  ARGS=(start "${ARGS[@]}" --port-base $PORT_BASE --no-doppler --env-file $D/macro.env --binaries-dir $D/bin/$SHA) ;;
  backup) ARGS=(backup "${ARGS[@]}" --out $D/backups/$(date +%Y%m%d-%H%M)) ;;
  status) ARGS=(status "${ARGS[@]}") ;;
  down)   ARGS=(down "${ARGS[@]}" --keep-data) ;;
esac
set +e
sudo docker run --rm --network host \
  -v /var/run/docker.sock:/var/run/docker.sock -v $R:$R -v $D:$D -w $R \
  -e MACRO_FRONTEND_BUNDLE=$D/frontend/$SHA \
  youriheuvel/macro-toolbox:$SHA stack "${ARGS[@]}"
RC=$?
# Caddy runs with its admin API off, so a regenerated Caddyfile only takes
# effect after a restart. analytics_proxy (Macro's own telemetry) stays off.
if [ "$RC" = 0 ] && { [ "$CMD" = start ] || [ "$CMD" = update ]; }; then
  sudo docker restart macro-prod-proxy-1 >/dev/null
  sudo docker update --restart no macro-prod-analytics_proxy-1 >/dev/null 2>&1 && sudo docker stop macro-prod-analytics_proxy-1 >/dev/null 2>&1
fi
# Traefik (dokploy-network) reaches the proxy and FusionAuth by container name.
for c in macro-prod-proxy-1 macro-prod-fusionauth-1; do
  sudo docker network connect dokploy-network $c 2>/dev/null || true
done
exit $RC
