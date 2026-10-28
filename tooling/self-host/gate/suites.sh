#!/bin/bash
# Macro's own suites for one tree, on the development-mode instance `gate`.
#
#   suites.sh <role> <tree> <binaries-dir> <result-dir> <harness-tree> <base-sha> <cand-sha>
#
# The stack is brought up with the harness tree's xtask (the candidate's, which
# carries the fork's boot fixes) and the role's binaries; seed, tests and
# vitest come from the role's tree. Results land in <result-dir> as
#   rust-e2e.log, web-e2e.json, vitest.json, unit/<crate>.log
# which report.py turns into pass/fail sets. FILL_BASE_TREE/FILL_BASE_DIR also
# run the baseline's missing unit/<crate>.log while Postgres is up. 
set -uo pipefail
ROLE=$1 TREE=$2 OUT=$3 R=$4 HARNESS=$5 BASE=$6 CAND=$7
G=$HOME/macro-build/gate
# Port base of the `gate` instance; 42000 (macro-e2e), 43000 (staging) and
# 44000 (macro-rt) are taken on luka-mini.
PB=${GATE_PORT_BASE:-45000}
export CARGO_TARGET_DIR=$G/target-$ROLE SQLX_OFFLINE=true CARGO_BUILD_JOBS=${JOBS:-8} CARGO_PROFILE_DEV_DEBUG=0
mkdir -p "$R/unit"
log() { echo "$(date +%T) [$ROLE] $*"; }
# Containers read the generated files (FusionAuth's kickstart runs as uid
# 1001): the stack must be generated with umask 022, secrets go 0600 explicitly.
umask 022
[ -f "$G/gate-dev.env" ] || ( umask 077; printf 'DEV_DANGEROUS_LOCAL_CONTAINERS=false\n' > "$G/gate-dev.env"; grep '^ANTHROPIC_API_KEY=' "$HOME/macro-build/e2e.env" >> "$G/gate-dev.env" )

stack() { (\cd "$HARNESS" && just stack "$@"); }
# Docker's default address pools are used up on this machine by other stacks,
# so the instance's networks get fixed subnets outside them (as macro-rt
# does). Compose accepts its two networks when they carry its network label.
ensure_networks() {
  local i=44 n
  for n in databases-gate auth-gate macro-gate_services macro-gate_auth-internal; do
    if ! docker network inspect "$n" >/dev/null 2>&1; then
      case $n in
        macro-gate_*) docker network create --subnet "10.250.$i.0/24" --label "com.docker.compose.network=${n#macro-gate_}" "$n" ;;
        *) docker network create --subnet "10.250.$i.0/24" "$n" ;;
      esac >/dev/null || return 1
    fi
    i=$((i + 1))
  done
}
# Another stack on our ports would make `stack up` fail half-way.
ports_free() {
  local busy
  busy=$(ss -ltnH | awk '{print $4}' | sed 's/.*://' | awk -v b=$PB '$1 >= b && $1 < b + 40' | sort -un | tr '\n' ' ')
  [ -z "$busy" ] || { docker ps --format '{{.Names}}' | grep -q '^macro-gate-'; } || {
    log "ports $busy in $PB-$((PB + 39)) are taken by another stack; set GATE_PORT_BASE"; return 1; }
}
# Containers write root-owned runtime files into the tree (Caddy's data under
# generated/<instance>, wrangler tmp of the ai-editing worker). The image
# builds use the tree as context and fail on files they cannot read, so remove
# those (as root, through a throwaway container) before each bring-up.
clean_unreadable() {
  local f
  find "$HARNESS" \( -path "$HARNESS/target" -o -path "$HARNESS/.git" -o -name node_modules \) -prune -o ! -readable -print 2>/dev/null |
    while read -r f; do
      [ -e "$f" ] || continue
      docker run --rm -v "$(dirname "$f")":/x "${GATE_HELPER_IMAGE:-alpine:3}" rm -rf "/x/$(basename "$f")" >/dev/null 2>&1 &&
        log "removed root-owned $f"
    done
}
up() {
  ports_free || return 1
  clean_unreadable
  # A tree generated under umask 077 keeps its 0700 kickstart dir across runs.
  [ -d "$HARNESS/infra/local/generated/gate" ] && chmod -R go+rX "$HARNESS/infra/local/generated/gate/kickstart" 2>/dev/null
  ensure_networks || { log "could not create the gate networks"; return 1; }
  log "stack up gate ($OUT)"
  stack up --instance gate --port-base $PB --no-doppler --env-file "$G/gate-dev.env" \
    --binaries-dir "$OUT" --no-frontend --traces off --fresh > "$R/stack-up.log" 2>&1
}
GEN=$HARNESS/infra/local/generated/gate/local.generated.env
PROXY=https://localhost:$((PB + 9)) FRONT=http://localhost:$((PB + 10))
PG=postgres://user:password@localhost:$PB/macrodb

test_env() {
  export LOCAL_E2E=true LOCAL_E2E_ENV_FILE=$GEN LOCAL_E2E_BASE_URL=$FRONT/app LOCAL_E2E_BACKEND_ORIGIN=$PROXY \
    LOCAL_E2E_DATABASE_URL=$PG DATABASE_URL=$PG LOCAL_E2E_DOCUMENT_STORAGE_URL=$PROXY/dss \
    LOCAL_E2E_CONNECTION_GATEWAY_WS_URL=wss://localhost:$((PB + 9))/connection-gateway \
    LOCAL_E2E_NOTIFICATION_URL=$PROXY/notification
  # Playwright waits for http://localhost:<port>/app; on this machine Vite's
  # dev-https plugin can issue a host certificate and would serve https there.
  export MACRO_DEV_HTTPS=false
}

# Crates the fork changed between the merge-base and the candidate.
affected_crates() {
  git -C "$HARNESS" diff --name-only "$BASE" "$CAND" -- crates services tooling/seed_cli | while read -r f; do
    d=$(dirname "$f"); while [ "$d" != . ] && [ ! -f "$HARNESS/$d/Cargo.toml" ]; do d=$(dirname "$d"); done
    [ -f "$HARNESS/$d/Cargo.toml" ] && sed -n 's/^name *= *"\(.*\)"/\1/p' "$HARNESS/$d/Cargo.toml" | head -1
  done | sort -u
}

run_unit() { # <tree> <result-dir> <target-dir>
  mkdir -p "$2/unit"
  for c in $(affected_crates); do
    [ -s "$2/unit/$c.log" ] && continue
    if ! grep -rqs --include=Cargo.toml "^name = \"$c\"" "$1/crates" "$1/services" "$1/tooling"; then
      echo "CRATE_ABSENT" > "$2/unit/$c.log"; continue
    fi
    log "cargo test -p $c ($1)"
    (\cd "$1" && CARGO_TARGET_DIR=$3 DATABASE_URL=$PG timeout 1800 cargo test --no-fail-fast -p "$c" > "$2/unit/$c.log" 2>&1; echo "EXIT $?" >> "$2/unit/$c.log")
  done
}

# One retry: under load FusionAuth's kickstart can miss its 4-minute window.
if ! up; then
  log "stack up failed, retrying once ($(grep -m1 -o 'all predefined address pools have been fully subnetted\|timed out waiting for the FusionAuth kickstart' "$R/stack-up.log" || echo 'see log'))"
  cp "$R/stack-up.log" "$R/stack-up.1.log"
  up || { log "stack up failed, see $R/stack-up.log"; echo "STACK_UP_FAILED" > "$R/stack-up.failed"
    stack down --instance gate > "$R/stack-down.log" 2>&1; exit 1; }
fi
rm -f "$R/stack-up.failed"

log "seed local-e2e-smoke"
( set -a; . "$GEN"; set +a
  export LOCAL_E2E_SEED=true DATABASE_URL=$PG LOCAL_AWS_URL=http://localhost:$((PB + 6)) \
    FUSIONAUTH_BASE_URL=http://localhost:$((PB + 5)) FUSIONAUTH_OAUTH_REDIRECT_URI=$FRONT/app
  # Built on the host like `xtask local-e2e` does: the bundled seed_cli reads
  # its data from CARGO_MANIFEST_DIR, which is /app inside the image.
  \cd "$TREE" && cargo run --quiet -p seed_cli -- scenario local-e2e-smoke ) > "$R/seed.log" 2>&1 || echo "SEED_FAILED" >> "$R/seed.log"

test_env
log "rust local E2E"
(\cd "$TREE" && timeout 2400 cargo test --no-fail-fast -p local_e2e_integration_tests -- --ignored --nocapture > "$R/rust-e2e.log" 2>&1; echo "EXIT $?" >> "$R/rust-e2e.log")

(\cd "$TREE" && bun install --frozen-lockfile > "$R/bun-install.log" 2>&1)
# The wasm builds (`dev:prepare`): Playwright gives the dev server only 60 s,
# which a cold tree does not fit, and some vitest suites load the wasm.
(\cd "$TREE/apps/web" && timeout 3600 bun run dev:prepare > "$R/web-prepare.log" 2>&1; echo "EXIT $?" >> "$R/web-prepare.log")

# Opt-in (gate.sh --web-e2e): on luka-mini the app under Playwright does not
# pick up the local E2E bearer token yet, so nearly every test times out on
# both trees (~45 min each) without telling them apart.
if [ "${RUN_WEB_E2E:-0}" = 1 ]; then
  log "web local E2E"
  rm -f "$R/web-e2e.skipped"
  LOCAL_JWT=$(\cd "$TREE/apps/web" && bun scripts/generate-local-e2e-token.ts 2> "$R/token.log") && export LOCAL_JWT
  (\cd "$TREE/apps/web" && PLAYWRIGHT_JSON_OUTPUT_NAME="$R/web-e2e.json" timeout 3600 \
    bunx playwright test --reporter=list,json --output "$R/web-e2e-artifacts" > "$R/web-e2e.log" 2>&1)
  unset LOCAL_JWT
else
  rm -rf "$R/web-e2e.json" "$R/web-e2e.log" "$R/web-e2e-artifacts"; echo "not run (gate.sh --web-e2e to run it)" > "$R/web-e2e.skipped"
fi
unset LOCAL_E2E

log "apps/web vitest"
# A worker per core needs ~9 GB here and got the gate OOM-killed.
(\cd "$TREE/apps/web" && timeout 2400 bunx vitest run --maxWorkers="${GATE_VITEST_WORKERS:-4}" \
  --reporter=json --outputFile="$R/vitest.json" > "$R/vitest.log" 2>&1)

if [ "${RUN_UNIT:-1}" = 1 ]; then
  run_unit "$TREE" "$R" "$CARGO_TARGET_DIR"
  # Crates the fork started touching after the baseline was cached.
  [ -n "${FILL_BASE_TREE:-}" ] && run_unit "$FILL_BASE_TREE" "$FILL_BASE_DIR" "$G/target-base"
fi

log "stack down gate"
stack down --instance gate > "$R/stack-down.log" 2>&1
exit 0
