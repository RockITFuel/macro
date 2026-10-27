# local_kms

## What it is

Encryption for local and self-hosted stacks: the AES-256-GCM stand-in for the
AWS KMS calls behind Cursor/agent API keys, Codex OAuth state and Microsoft
refresh tokens, keyed by `LOCAL_ENCRYPTION_KEY` (base64 of 32 bytes).

## Start here

- `src/lib.rs`: `LocalKms` — `encrypt`/`decrypt` (like `kms:Encrypt`/`Decrypt`)
  and `generate_data_key` (like `kms:GenerateDataKey`).

## Scope

- Owns: the local key, its ciphertext format (nonce + sealed bytes) and the
  encryption-context binding (sorted JSON as associated data).
- Not here: each feature's cipher and context → `crates/cursor_api_key`,
  `crates/codex_connection`, `services/authentication_service/src/microsoft_token_cipher.rs`.

## Checks

- `cargo test -p local_kms`

## Gotchas

- Rows record `KEY_ID` instead of a KMS ARN; rows written under KMS cannot be
  read with the local key and the other way round.
- Losing or changing `LOCAL_ENCRYPTION_KEY` makes every encrypted row unreadable.
