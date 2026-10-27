#!/bin/zsh -l
set -o pipefail
export DOCKER_CONFIG=$HOME/macro-build/docker-config DOCKER_HOST=unix:///var/run/docker.sock
export CARGO_NET_GIT_FETCH_WITH_CLI=true CPATH=$HOME/.local/curl-dev/usr/include/x86_64-linux-gnu
L=~/macro-build/logs; cd ~/github/macro; SHA=$(git rev-parse --short=12 HEAD); START=$(date +%s)
step() { echo "$(date +%T) $1" >> $L/release.txt; }
step "start $SHA"
~/macro-build/build.sh; step "rust: $(cat $L/result.txt)"; grep -q rc=0 $L/result.txt || exit 1
for t in $SHA self-host; do docker tag macro-rust-services:dev youriheuvel/macro-rust-services:$t; docker push -q youriheuvel/macro-rust-services:$t >/dev/null; done; step "rust pushed"
cd ~/macro-build/toolbox-src && git checkout -q --detach origin/self-host && ~/macro-build/toolbox.sh; step "toolbox: $(cat $L/toolbox-result.txt)"; grep -q rc=0 $L/toolbox-result.txt || exit 1
cd ~/github/macro
rm -rf ~/macro-build/frontend-dist
umask 077; python3 $HOME/macro-build/render-macro-env.py > $HOME/macro-build/macro.env && just stack build-frontend --no-doppler --env-file $HOME/macro-build/macro.env --out $HOME/macro-build/frontend-dist > $L/frontend.log 2>&1; step "frontend rc=$?"
test -f ~/macro-build/frontend-dist/index.html || exit 1
printf 'FROM scratch\nCOPY . /frontend\n' > ~/macro-build/frontend-dist.Dockerfile
docker build -q -f ~/macro-build/frontend-dist.Dockerfile -t youriheuvel/macro-frontend:$SHA -t youriheuvel/macro-frontend:self-host ~/macro-build/frontend-dist >/dev/null
for t in $SHA self-host; do docker push -q youriheuvel/macro-frontend:$t >/dev/null; done; step "frontend pushed"
step "done seconds=$(( $(date +%s)-START ))"
