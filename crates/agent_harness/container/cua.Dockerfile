# The sandbox image as a Cua Space (`MACRO_SANDBOX_RUNTIME=cua`).
#
# Cua injects its `cua-spacesd` agent only into images it can resolve in a
# registry; the sandbox image is local-only, so the agent is baked in here and
# made the entrypoint the way Cua's injection does it: it serves exec, files
# and ports beside the command, and keeps serving after the command exits.
# Built by `just build-cua`, which supplies `cua-spacesd` from the installed
# `cua` CLI.
ARG BASE=macro-agent-harness:latest
FROM ${BASE}
COPY --chmod=0555 cua-spacesd /.cua/bin/cua-spacesd
LABEL ai.cua.spacesd="3211"
ENTRYPOINT ["/.cua/bin/cua-spacesd", "supervise", "--on-exit", "serve", "--"]
CMD ["sleep", "infinity"]
