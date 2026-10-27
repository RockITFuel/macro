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
`just stack up --instance selfhost --no-doppler --env-file ./selfhost.env`)
writes the env file, the Caddy proxy, the LocalStack resources and the
FusionAuth kickstart. Run with `ENVIRONMENT=local`: production mode hardcodes
`macro.com` for cookies and redirects and reads secrets from AWS Secrets
Manager.

These settings, in the env file or the process env, turn the stack into a
public instance. Unset, it is the localhost development stack.

| Variable | Effect |
| --- | --- |
| `MACRO_PUBLIC_ORIGIN` | App origin (`https://macro.alphamonitoring.app`) for `FRONTEND_ORIGIN`, `APP_BASE_URL`, the public file/MCP/storage URLs and the FusionAuth redirects. The auth service is reached at `<origin>/auth`. Also drops the Mailpit route, the proxy's wildcard CORS and the auth service's login-code shortcuts, makes the session cookies `SameSite=Lax`, and refuses to start while a secret below still has its development value. |
| `MACRO_FUSIONAUTH_PUBLIC_URL` | Browser URL of FusionAuth (`FUSIONAUTH_PUBLIC_URL`), only used by OAuth sign-in and connect flows. |
| `MACRO_BIND_ADDRESS` | Publish every port on this address only (`127.0.0.1`). Needs `--instance`. |
| `MACRO_POSTGRES_PASSWORD`, `MACRO_FUSIONAUTH_DB_PASSWORD` | Database passwords. Postgres applies them only to an empty volume. |
| `MACRO_FUSIONAUTH_ADMIN_PASSWORD` | Password of the FusionAuth admin `admin@macro.com`. |
| `MACRO_SMTP_HOST`, `MACRO_SMTP_PORT`, `MACRO_SMTP_SECURITY`, `MACRO_SMTP_USERNAME`, `MACRO_SMTP_PASSWORD` | SMTP server for FusionAuth's login codes and the auth service's mail (invites, verification). `SECURITY` is `SSL` (implicit TLS, default port 465), `TLS` (STARTTLS, 587) or `NONE`. Unset, mail goes to Mailpit. Required with `MACRO_PUBLIC_ORIGIN`. |
| `MACRO_MAIL_FROM`, `MACRO_MAIL_FROM_NAME` | Sender of all that mail; it replaces the services' own `auth@macro.com`. Required with `MACRO_PUBLIC_ORIGIN`. |
| `MACRO_FRONTEND_BUNDLE` | Directory with a prebuilt static bundle (`index.html` at its root) that `stack up` and `stack update --frontend` serve instead of building with bun. |
| `MACRO_SIGNUP_ALLOWED_DOMAINS` | Comma-separated email domains that may create an account, by any sign-in method. Existing users keep signing in; invited users from other domains are refused. |

Secrets go in the same env file and reach the services and the kickstart
alike: `INTERNAL_AUTH_KEY`, `FUSIONAUTH_API_KEY`, `FUSIONAUTH_CLIENT_SECRET_KEY`,
`JWT_SECRET_KEY`, `MACRO_API_TOKEN_PRIVATE_SECRET_KEY` and
`MACRO_API_TOKEN_PUBLIC_KEY` (an RSA pair), `DOCUMENT_PERMISSION_JWT`,
`INTERNAL_CALL_SECRET`, `URL_SIGNING_HMAC`, `ACCOUNT_LINK_STATE_SECRET` (32+
bytes) and `MCP_CREDENTIALS_KEY_SECRET_NAME` (base64 of 32 bytes). Avoid `$` in
values: compose interpolates them. Changing a kickstart secret re-inits
FusionAuth on the next `stack up`.

The server has no bun: build the bundle on luka-mini with
`cargo x stack build-frontend --no-doppler --env-file ./selfhost.env --out <dir>`
(it builds the wasm modules first; needs `wasm-pack`) and copy it over. The
bundle is the same for every origin; rebuild it for a new commit, or when the
GitHub client is added or removed.

A public stack runs no local agent sandboxes: `DEV_DANGEROUS_LOCAL_CONTAINERS`
is `false`, the harness gets no Docker socket and no sandbox image is built.
`@coder` sessions need `DAYTONA_API_KEY` instead.

Our values: `smtp.mx.cloudflare.net`, `SSL`, port 465, sender
`noreply@alphamonitoring.app` named `Macro`, domains
`d2d.cloud,alphamonitoring.app,wendythefoodscientist.com`.

With a real `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` the kickstart creates
the `github` identity provider and the bundle shows "Continue with GitHub".
The GitHub OAuth app's callback is FusionAuth's
`<MACRO_FUSIONAUTH_PUBLIC_URL>/oauth2/callback`, so the auth host must be
routed. A GitHub account without a public email cannot sign up.

Traefik routes the app origin to the instance's proxy port (`--port-base` + 9,
HTTPS with the development CA, so skip verification) and the auth host, when
used, to FusionAuth (`--port-base` + 5); see `Port` in
`tooling/xtask/crates/xtask_local/src/local/instance.rs`.

## Outlook

Outlook (Microsoft Graph) is built in. It needs an Entra app registration with
redirect URI on `macro.alphamonitoring.app` and the delegated scopes in
`crates/fusionauth/src/microsoft/oauth.rs`, then `MICROSOFT_CLIENT_ID`,
`MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID=organizations` and
`MICROSOFT_TOKEN_KMS_KEY_ID` (a LocalStack KMS key) on the authentication
service. Secrets go in 1Password, vault Alpha.

## Deploying

- `tooling/self-host/release-luka-mini.sh` (on luka-mini) builds and pushes
  `youriheuvel/macro-rust-services`, `macro-toolbox` and `macro-frontend`,
  tagged with the commit.
- `tooling/self-host/render-macro-env.py` renders 1Password "Production Macro
  Environment" (vault Alpha) as the env file. Pipe it to the server, never write
  it into the repo: `python3 render-macro-env.py | ssh server 'umask 077; cat > /srv/macro-deploy/macro.env'`.
- `tooling/self-host/deploy.sh <sha> up|update|status|down` lives at
  `/srv/macro-deploy/deploy.sh` on morgo-warsaw. The stack is instance `prod`,
  ports 47000+ on 127.0.0.1; Traefik routes come from
  `/etc/dokploy/traefik/dynamic/macro-self-hosted.yml`.
