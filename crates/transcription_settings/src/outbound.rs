//! Outbound (driven) adapters for team transcription settings.

pub mod entity_access_teams;
#[cfg(feature = "postgres")]
pub mod pg_repo;
