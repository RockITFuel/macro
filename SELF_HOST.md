# Self-hosting this fork

This is RockITFuel's fork of [macro-inc/macro](https://github.com/macro-inc/macro).
`main` mirrors upstream; our changes live on `self-host`. Keep fixes small and
upstreamable so `main` can be merged into `self-host` without conflicts.

## Where things run

| What | Where |
| --- | --- |
| Builds | luka-mini, checkout `~/github/macro` (never on morgo-warsaw: production, little disk) |
| Images | Docker Hub `youriheuvel/macro-*`, tagged with the commit and `self-host` |
| Deploy | Dokploy on morgo-warsaw, `https://macro.alphamonitoring.app` |
| DNS | Cloudflare zone `alphamonitoring.app`: `macro` and `*.macro` A records to Warsaw, unproxied |

## Building images

On luka-mini, `~/macro-build/build.sh` builds `docker/Dockerfile.dev`
(target `services_bundle`, `CARGO_BUILD_JOBS=8`) as the systemd user unit
`macro-build`, with logs in `~/macro-build/logs/`. It uses its own Docker config
(`DOCKER_CONFIG=~/macro-build/docker-config`, which holds the Docker Hub login)
and the system daemon (`DOCKER_HOST=unix:///var/run/docker.sock`).

```sh
systemctl --user start macro-build        # build
cat ~/macro-build/logs/result.txt         # rc and seconds
```

BuildKit cache mounts keep `target/`, so a rebuild after an upstream merge only
compiles what changed.

## Changing Rust code: use blaze

[blaze](https://github.com/indexable-inc/blaze) is installed on luka-mini and
the MacBook. It keeps the project compiled in memory and rebuilds an edited
function in milliseconds instead of relinking.

```sh
cargo blaze run -p authentication_service   # like cargo run
cargo blaze test -p fusionauth              # like cargo test
cargo blaze build                           # like cargo build
```

blaze builds with its own nightly toolchain and uses several GB of memory. Use it
for the edit loop only; images and the final check are plain `cargo` with the
toolchain in `rust-toolchain.toml`.

## Configuration

There is no Doppler and no AWS. The local stack's generator (`tooling/xtask`,
`just run_local --no-doppler --env-file ./local.env`) writes the env file, the
Caddy proxy, the LocalStack resources and the FusionAuth kickstart; the
self-hosted deploy reuses that output with the public origin set to
`https://macro.alphamonitoring.app`. Run with `ENVIRONMENT=local`: production
mode hardcodes `macro.com` for cookies and redirects and reads secrets from AWS
Secrets Manager.

## Outlook

Outlook (Microsoft Graph) is built in. It needs an Entra app registration with
redirect URI on `macro.alphamonitoring.app` and the delegated scopes in
`crates/fusionauth/src/microsoft/oauth.rs`, then `MICROSOFT_CLIENT_ID`,
`MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID=organizations` and
`MICROSOFT_TOKEN_KMS_KEY_ID` (a LocalStack KMS key) on the authentication
service. Secrets go in 1Password, vault Alpha.
