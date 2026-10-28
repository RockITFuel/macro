#![deny(missing_docs)]
//! Team transcription settings: whether a team's calls and dictation are
//! transcribed, by which provider (the self-hosted local speech-to-text hub
//! or OpenAI), and with which model and language.
//!
//! Team owners and admins edit them in Settings > Team > Transcription. Each
//! setting a team has not set falls back to the server env
//! ([`domain::models::TranscriptionEnv`]), so a stack configured only through
//! env keeps working. Secrets (the hub token, the OpenAI key) stay in env and
//! are only reported as set or not set.
//!
//! # Architecture
//!
//! - **domain**: settings models, env fallback, validation, the service.
//! - **inbound**: the admin HTTP endpoint (`GET`/`PUT /transcription/settings`).
//! - **outbound**: the Postgres repository and the team lookup adapter.

pub mod domain;

#[cfg(feature = "inbound")]
pub mod inbound;

#[cfg(feature = "outbound")]
pub mod outbound;
