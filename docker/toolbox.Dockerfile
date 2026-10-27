# Self-host toolbox: the local-stack orchestrator (xtask_local) plus the host
# tools it shells out to, so `stack up` can run on a server without a Rust or
# Bun toolchain. Run it with the docker socket and the repo checkout mounted at
# the same path as on the host (compose bind mounts resolve on the host):
#   docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
#     -v /srv/macro:/srv/macro -w /srv/macro --env-file macro.env \
#     youriheuvel/macro-toolbox:self-host stack up --instance prod ...
FROM rust:1.94.0-trixie AS builder
RUN apt-get update && apt-get install -y --no-install-recommends cmake libcurl4-openssl-dev && \
  apt-get clean && rm -rf /var/lib/apt/lists/*
ENV CARGO_NET_GIT_FETCH_WITH_CLI=true
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=shared \
    --mount=type=cache,target=/usr/local/cargo/git/db,sharing=shared \
    --mount=type=cache,target=/app/target,id=macro-toolbox-target,sharing=locked \
    cargo build --release -p xtask_local --features local-stack \
    && cargo install --locked --root /out sqlx-cli --no-default-features --features rustls,postgres \
    && cp target/release/xtask_local /out/bin/

FROM docker:28-cli AS docker

FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git openssh-client openssl bash procps hostname && \
  apt-get clean && rm -rf /var/lib/apt/lists/*
COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
COPY --from=builder /out/bin/ /usr/local/bin/
ENTRYPOINT ["xtask_local"]
