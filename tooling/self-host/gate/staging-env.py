#!/usr/bin/env python3
"""Write the env file of the gate's `staging` instance to stdout.

Staging runs in public mode, like production: MACRO_PUBLIC_ORIGIN, its own
random secrets, MACRO_LOCAL_ENCRYPTION_KEY, the development R2 buckets,
billing off, the signup allowlist and a LiveKit dev server. Differences from
production: the origin is https://localhost:<port-base + 9>, mail goes to the
instance's Mailpit over plain SMTP (so login codes stay readable) and the
LiveKit server is local.

    staging-env.py <public-origin> <livekit-url> <livekit-key> <livekit-secret>

Secrets come from 1Password (vault Alpha) and the e2e env file; values are
never printed anywhere but stdout, which the caller writes to a 0600 file.
"""
import base64
import json
import os
import secrets
import subprocess
import sys


def op_fields(item: str) -> dict[str, str]:
    raw = subprocess.check_output(
        ["op", "item", "get", item, "--vault", "Alpha", "--format", "json", "--reveal"]
    )
    return {f["label"]: f.get("value") or "" for f in json.loads(raw)["fields"]}


def env_file(path: str) -> dict[str, str]:
    out = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k] = v.strip().strip('"')
    return out


def rsa_pair() -> tuple[str, str]:
    priv = subprocess.check_output(
        ["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048"],
        stderr=subprocess.DEVNULL,
    ).decode()
    pub = subprocess.run(
        ["openssl", "pkey", "-pubout"], input=priv.encode(), capture_output=True, check=True
    ).stdout.decode()
    return priv, pub


def main() -> None:
    origin, lk_url, lk_key, lk_secret = sys.argv[1:5]
    e2e = env_file(os.path.expanduser("~/macro-build/e2e.env"))
    r2 = op_fields("Development Macro R2")
    priv, pub = rsa_pair()
    hexs = lambda n=32: secrets.token_hex(n)  # noqa: E731
    env = {
        "ENVIRONMENT": "local",
        "MACRO_PUBLIC_ORIGIN": origin,
        "MACRO_BIND_ADDRESS": "127.0.0.1",
        "MACRO_POSTGRES_PASSWORD": hexs(16),
        "MACRO_FUSIONAUTH_DB_PASSWORD": hexs(16),
        "MACRO_FUSIONAUTH_ADMIN_PASSWORD": hexs(16),
        "MACRO_SMTP_HOST": "mailpit",
        "MACRO_SMTP_PORT": "1025",
        "MACRO_SMTP_SECURITY": "NONE",
        "MACRO_MAIL_FROM": "noreply@alphamonitoring.app",
        "MACRO_MAIL_FROM_NAME": "Macro",
        "MACRO_SIGNUP_ALLOWED_DOMAINS": "d2d.cloud,alphamonitoring.app,wendythefoodscientist.com",
        "MACRO_LOCAL_ENCRYPTION_KEY": base64.b64encode(secrets.token_bytes(32)).decode(),
        "INTERNAL_AUTH_KEY": hexs(),
        "FUSIONAUTH_API_KEY": hexs(),
        "FUSIONAUTH_CLIENT_SECRET_KEY": hexs(),
        "JWT_SECRET_KEY": hexs(),
        "MACRO_API_TOKEN_PRIVATE_SECRET_KEY": priv,
        "MACRO_API_TOKEN_PUBLIC_KEY": pub,
        "DOCUMENT_PERMISSION_JWT": hexs(),
        "INTERNAL_CALL_SECRET": hexs(),
        "URL_SIGNING_HMAC": hexs(),
        "ACCOUNT_LINK_STATE_SECRET": hexs(),
        "MCP_CREDENTIALS_KEY_SECRET_NAME": base64.b64encode(secrets.token_bytes(32)).decode(),
        "DEV_DANGEROUS_LOCAL_CONTAINERS": "false",
        "ANTHROPIC_API_KEY": e2e.get("ANTHROPIC_API_KEY", ""),
        "LIVEKIT_SERVER_URL": lk_url,
        "LIVEKIT_API_KEY": lk_key,
        "LIVEKIT_API_SECRET": lk_secret,
    }
    env.update({k: v for k, v in r2.items() if k.startswith("MACRO_S3_")})
    bad = [k for k, v in env.items() if "$" in v]
    if bad:
        sys.exit("values containing $ (compose interpolation): " + ", ".join(bad))
    for k, v in env.items():
        esc = v.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
        sys.stdout.write(f'{k}="{esc}"\n')


main()
