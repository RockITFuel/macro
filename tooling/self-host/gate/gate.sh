#!/bin/bash
# Release gate for self-hosted Macro, run on luka-mini.
#
#   gate.sh <commit|ref> [--no-suites] [--no-smoke] [--no-unit] [--web-e2e] [--strict-realtime]
#
# 1. Builds the Rust services bundle (docker/Dockerfile.dev) for the commit and
#    for its merge-base with origin/main (the upstream baseline).
# 2. Runs Macro's own suites (local E2E seed + ignored Rust E2E tests,
#    apps/web Playwright local E2E, apps/web vitest, cargo test of the crates
#    the fork changed) on a development-mode instance `gate` for both trees, so
#    failures that already happen upstream are not blamed on the fork.
#    Baseline results are cached per merge-base.
# 3. Builds the frontend bundle and brings the public-mode instance `staging`
#    (prod-like env, see staging-env.py) to the commit with `stack update`,
#    the same path deploy.sh takes in production.
# 4. Runs the self-host smoke suite (tests/selfhost-smoke) against staging.
# 5. Prints GO/NO-GO with the evidence paths (exit 0 = GO); everything lands
#    in ~/macro-build/gate/<sha12>/ (summary.txt, gate.log, logs/, suites/, smoke/).
#
# Realtime smoke checks (@realtime) are reported but only block with
# --strict-realtime. Heavy steps take ~/macro-build/heavy.lock, shared with
# other agents on this machine.
#
# Only touches the instances `gate` and `staging`, worktrees under
# ~/macro-build/gate (src-cand, src-base, src-stage) and the container `macro-staging-livekit`.
set -uo pipefail
umask 022

REF=${1:?usage: gate.sh <commit|ref> [--no-suites] [--no-smoke] [--no-unit] [--web-e2e] [--strict-realtime]}; shift
RUN_SUITES=1 RUN_SMOKE=1 RUN_UNIT=1
for a in "$@"; do case $a in
  --no-suites) RUN_SUITES=0 ;; --no-smoke) RUN_SMOKE=0 ;; --no-unit) RUN_UNIT=0 ;;
  --strict-realtime) export GATE_STRICT_REALTIME=1 ;;
  --web-e2e) export RUN_WEB_E2E=1 ;;
  *) echo "unknown flag $a" >&2; exit 2 ;; esac; done

GATE_DIR=$(\cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)
SMOKE_DIR=$(readlink -f "$GATE_DIR/../../../tests/selfhost-smoke")
G=$HOME/macro-build/gate
REPO=$HOME/macro-build/release-src   # any worktree of the shared macro clone
export DOCKER_CONFIG=$HOME/macro-build/docker-config DOCKER_HOST=unix:///var/run/docker.sock
export CARGO_NET_GIT_FETCH_WITH_CLI=true CPATH=$HOME/.local/curl-dev/usr/include/x86_64-linux-gnu
export PATH=$HOME/.cargo/bin:$HOME/.local/bin:$HOME/.bun/bin:$PATH
STAGING_BASE=43000

mkdir -p "$G"
exec 9>"$G/.lock"; flock -n 9 || { echo "another gate run holds $G/.lock" >&2; exit 3; }
# Builds, stack changes and test runs wait for other agents' heavy work.
heavy() { flock -w 5400 "$HOME/macro-build/heavy.lock" "$@"; }

git -C "$REPO" fetch -q origin || exit 1
SHA=$(git -C "$REPO" rev-parse --verify "$REF^{commit}" 2>/dev/null || git -C "$REPO" rev-parse --verify "origin/$REF^{commit}") || { echo "unknown ref $REF" >&2; exit 2; }
BASE=$(git -C "$REPO" merge-base "$SHA" origin/main)
S12=${SHA:0:12} B12=${BASE:0:12}
A=$G/$S12; BL=$G/baseline-$B12
mkdir -p "$A/logs" "$BL"
LOG=$A/gate.log
log() { echo "$(date +%T) $*" | tee -a "$LOG"; }
log "gate $S12 (baseline merge-base $B12)"

# Worktree at a commit; the baseline gets the candidate's docker build files
# (the fork's Dockerfile.dev fixes are build plumbing, not product code).
checkout() { # <dir> <sha>
  [ -d "$1" ] || git -C "$REPO" worktree add -q --detach "$1" "$2" || return 1
  git -C "$1" checkout -q -f --detach "$2" && git -C "$1" clean -qfd -e node_modules >/dev/null
}
checkout "$G/src-cand" "$SHA" || exit 1
checkout "$G/src-base" "$BASE" || exit 1
# Staging gets its own tree: its generated state (root-owned Caddy data) must
# not sit inside the suites' docker build context.
checkout "$G/src-stage" "$SHA" || exit 1
git -C "$G/src-base" checkout -q "$SHA" -- docker/Dockerfile.dev .dockerignore

build_bins() { # <tree> <log>
  heavy "$GATE_DIR/build-bins.sh" "$1" > "$2" 2>&1 || return 1
  tail -1 "$2" | awk '{print $2}'
}
# A previous run's containers leave root-owned files (Caddy data under
# infra/local/generated) in src-cand, which break the image build's context.
clean_unreadable() { "$GATE_DIR/clean-unreadable.sh" "$1" | tee -a "$LOG"; }
clean_unreadable "$G/src-cand"
log "building candidate binaries"
OUT_CAND=$(build_bins "$G/src-cand" "$A/logs/bins.log") || { log "FAIL candidate build, see $A/logs/bins.log"; echo "RESULT: NO-GO (candidate build failed, see $A/logs/bins.log)" | tee "$A/summary.txt"; exit 1; }

FAILED_STEPS=()
if [ $RUN_SUITES = 1 ]; then
  if [ ! -f "$BL/done" ]; then
    log "building baseline binaries"
    OUT_BASE=$(build_bins "$G/src-base" "$BL/bins.log") || { log "baseline build failed, see $BL/bins.log"; OUT_BASE=; }
    if [ -n "$OUT_BASE" ]; then
      log "baseline suites"
      RUN_UNIT=$RUN_UNIT heavy "$GATE_DIR/suites.sh" base "$G/src-base" "$OUT_BASE" "$BL" "$G/src-cand" "$BASE" "$SHA" >> "$LOG" 2>&1
      # Cache the baseline only when its harness worked.
      if [ -f "$BL/stack-up.failed" ] || grep -qs SEED_FAILED "$BL/seed.log" || grep -qs 'config.webServer' "$BL/web-e2e.log"; then
        log "baseline harness incomplete, not cached"
      else
        touch "$BL/done"
      fi
    fi
  fi
  log "candidate suites"
  RUN_UNIT=$RUN_UNIT FILL_BASE_TREE=$G/src-base FILL_BASE_DIR=$BL \
    heavy "$GATE_DIR/suites.sh" cand "$G/src-cand" "$OUT_CAND" "$A/suites" "$G/src-cand" "$BASE" "$SHA" >> "$LOG" 2>&1
fi

if [ $RUN_SMOKE = 1 ]; then
  log "staging: frontend bundle"
  "$GATE_DIR/staging.sh" --env-only || { log "FAIL staging env"; exit 1; }
  FE=$HOME/macro-build/frontend-$S12
  if [ ! -f "$FE/index.html" ]; then
    (\cd "$G/src-cand" && bun install --frozen-lockfile > "$A/logs/bun-install.log" 2>&1 &&
      heavy just stack build-frontend --no-doppler --env-file "$G/staging.env" --out "$FE.tmp" > "$A/logs/frontend.log" 2>&1 &&
      rm -rf "$FE" && mv "$FE.tmp" "$FE") || { log "FAIL frontend build, see $A/logs/frontend.log"; echo "RESULT: NO-GO (frontend build failed, see $A/logs/frontend.log)" | tee "$A/summary.txt"; exit 1; }
  fi
  log "staging: bring to $S12"
  if ! heavy "$GATE_DIR/staging.sh" "$G/src-stage" "$OUT_CAND" "$FE" > "$A/logs/staging.log" 2>&1; then
    log "FAIL staging update, see $A/logs/staging.log"; FAILED_STEPS+=(staging)
  else
    log "smoke suite"
    mkdir -p "$A/smoke"
    [ -d "$SMOKE_DIR/node_modules" ] || (\cd "$SMOKE_DIR" && bun install > "$A/logs/smoke-install.log" 2>&1)
    (\cd "$SMOKE_DIR" && SMOKE_BASE_URL=https://localhost:$((STAGING_BASE + 9)) \
      SMOKE_MAILPIT_URL=http://127.0.0.1:$((STAGING_BASE + 8))/mailpit SMOKE_OUT="$A/smoke" \
      SMOKE_LABEL=$S12 NODE_TLS_REJECT_UNAUTHORIZED=0 heavy bunx playwright test > "$A/smoke/run.log" 2>&1)
    [ $? = 0 ] || FAILED_STEPS+=(smoke)
  fi
fi

log "comparing"
python3 "$GATE_DIR/report.py" --cand "$A" --base "$BL" --sha "$S12" --base-sha "$B12" \
  --failed-steps "${FAILED_STEPS[*]:-}" | tee "$A/summary.txt"
grep -q '^RESULT: GO' "$A/summary.txt"
