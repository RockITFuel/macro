#!/bin/bash
# build-bins.sh <tree-dir>: docker-build the Rust services bundle for the tree into ~/macro-build/out-<short sha>.
set -o pipefail
export DOCKER_CONFIG=$HOME/macro-build/docker-config DOCKER_HOST=unix:///var/run/docker.sock DOCKER_BUILDKIT=1
TREE=$1; cd "$TREE" || exit 2
SHORT=$(git rev-parse --short=10 HEAD); OUT=$HOME/macro-build/out-$SHORT
if [ -x "$OUT/authentication_service" ] && [ -x "$OUT/seed_cli" ]; then echo "cached $OUT"; exit 0; fi
docker build -f docker/Dockerfile.dev --target services_bundle --build-arg CARGO_BUILD_JOBS=${JOBS:-8} -t macro-rust-services:gate-$SHORT --progress=plain . || exit 1
rm -rf "$OUT.tmp"; id=$(docker create macro-rust-services:gate-$SHORT) && docker cp $id:/app/out "$OUT.tmp" && docker rm $id >/dev/null && rm -rf "$OUT" && mv "$OUT.tmp" "$OUT"
docker rmi macro-rust-services:gate-$SHORT >/dev/null 2>&1
echo "built $OUT"
