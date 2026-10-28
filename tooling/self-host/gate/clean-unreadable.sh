#!/bin/bash
# Removes the files under <tree> this user cannot read.
#
#   clean-unreadable.sh <tree>
#
# Containers write root-owned runtime files into a tree (Caddy's data under
# infra/local/generated/<instance>, wrangler tmp of the ai-editing worker).
# Image builds use the tree as context and fail with "permission denied" on
# files they cannot read, so remove those as root, through a throwaway
# container. target/, .git and node_modules are skipped.
set -uo pipefail
T=${1:?usage: clean-unreadable.sh <tree>}
find "$T" \( -path "$T/target" -o -path "$T/.git" -o -name node_modules \) -prune -o ! -readable -print 2>/dev/null |
  while read -r f; do
    [ -e "$f" ] || continue
    docker run --rm -v "$(dirname "$f")":/x "${GATE_HELPER_IMAGE:-alpine:3}" rm -rf "/x/$(basename "$f")" >/dev/null 2>&1 &&
      echo "$(date +%T) removed root-owned $f"
  done
exit 0
