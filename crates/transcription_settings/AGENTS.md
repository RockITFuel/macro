# transcription_settings

## What it is

Speech-to-text settings per team (calls and composer dictation): on/off,
provider (self-hosted local hub or OpenAI), hub URL, hub model and dictation
language. Team owners and admins edit them in Settings › Team › Transcription.

## How it works

`team_transcription_settings` stores only what a team changed; every `NULL`
falls back to the server env (`TranscriptionEnv`, read once at startup by
`document_storage_service`). `effective_for_user` resolves a user's team
settings for dictation (`dictation::DictationRouting`) and call agent dispatch
(`call::CallTranscriptionGate`); both adapters live in the service.

## Start here

- `src/domain/models.rs`: settings, env fallback (`resolve`) and validation.
- `src/domain/service.rs`: get / update / effective_for_user.
- `src/inbound/axum_router.rs`: `GET`/`PUT /transcription/settings` (admin/owner).

## Scope

- Owns: `team_transcription_settings`.
- Not here: the transcription itself → `crates/dictation`, `crates/call`,
  `services/transcription` (local STT hub, workers, LiveKit agent).

## Checks

- `cargo test -p transcription_settings --all-features` (pg tests need `DATABASE_URL`).

## Gotchas

- Secrets (`DICTATION_STT_API_KEY`, `OPENAI_API_KEY`) never go in the table; the
  API only reports them as set or not set.
- The hub token is sent to the team's hub URL, so a hub URL is accepted only
  for the host of `DICTATION_STT_API_BASE` or a host in
  `DICTATION_STT_ALLOWED_HOSTS`.

## Related

- Rules: `.agents/rules/config-and-service-urls.md` · Docs: `services/transcription/LOCAL_STT.md`
