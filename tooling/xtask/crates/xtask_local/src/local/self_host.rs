//! Settings that turn a local stack into a public self-hosted instance.
//!
//! Every setting is optional and read from the process env or `--env-file`
//! (process env wins, as in [`super::env_layer`]). With none set the stack is
//! the plain localhost development stack. They are read before the typed
//! [`super::local_env::LocalEnv`] is built, because the env it derives
//! (`FRONTEND_ORIGIN`, `DATABASE_URL`, the internal keys under each of their
//! names) has to agree with them, and are written back into the resolved env
//! so the kickstart, compose override and proxy read the same values.

use std::collections::BTreeMap;

use anyhow::{Result, bail};

use super::identity;

#[cfg(test)]
mod test;

/// Browser-facing origin of the app, e.g. `https://macro.example.com`.
pub const PUBLIC_ORIGIN: &str = "MACRO_PUBLIC_ORIGIN";
/// Browser-facing FusionAuth URL, for the OAuth flows that redirect to it.
pub const FUSIONAUTH_PUBLIC_URL: &str = "MACRO_FUSIONAUTH_PUBLIC_URL";
/// Host address every published port binds to, e.g. `127.0.0.1`.
pub const BIND_ADDRESS: &str = "MACRO_BIND_ADDRESS";
/// Password of the `user` role of the Macro Postgres.
pub const POSTGRES_PASSWORD: &str = "MACRO_POSTGRES_PASSWORD";
/// Password of FusionAuth's own Postgres (root and `fusionauth` roles).
pub const FUSIONAUTH_DB_PASSWORD: &str = "MACRO_FUSIONAUTH_DB_PASSWORD";
/// Password of the FusionAuth admin user the kickstart creates.
pub const FUSIONAUTH_ADMIN_PASSWORD: &str = "MACRO_FUSIONAUTH_ADMIN_PASSWORD";

/// The internal service key, written under every name a service reads it by
/// and into the FusionAuth webhook headers.
pub const INTERNAL_AUTH_KEY: &str = "INTERNAL_AUTH_KEY";
/// The FusionAuth API key, written as both `FUSIONAUTH_API_KEY` and
/// `FUSIONAUTH_API_KEY_SECRET_KEY` and registered by the kickstart.
pub const FUSIONAUTH_API_KEY: &str = "FUSIONAUTH_API_KEY";

/// The settings that exist only here; the two keys above are written by
/// [`super::local_env::LocalEnv`] under each of their names.
const KEYS: [&str; 6] = [
    PUBLIC_ORIGIN,
    FUSIONAUTH_PUBLIC_URL,
    BIND_ADDRESS,
    POSTGRES_PASSWORD,
    FUSIONAUTH_DB_PASSWORD,
    FUSIONAUTH_ADMIN_PASSWORD,
];

/// Today's Postgres password, baked into `docker/docker-compose-databases.yml`.
const DEFAULT_POSTGRES_PASSWORD: &str = "password";

/// The settings of one run. `Default` is the local development stack.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SelfHost {
    pub public_origin: Option<String>,
    pub fusionauth_public_url: Option<String>,
    pub bind_address: Option<String>,
    pub postgres_password: Option<String>,
    pub fusionauth_db_password: Option<String>,
    pub fusionauth_admin_password: Option<String>,
    pub internal_auth_key: Option<String>,
    pub fusionauth_api_key: Option<String>,
}

impl SelfHost {
    /// Read the settings through `lookup`. Empty values count as unset, and a
    /// trailing slash is dropped from the URLs so paths can be appended.
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Self {
        let get = |key: &str| lookup(key).filter(|value| !value.trim().is_empty());
        let url = |key: &str| get(key).map(|value| value.trim_end_matches('/').to_owned());
        SelfHost {
            public_origin: url(PUBLIC_ORIGIN),
            fusionauth_public_url: url(FUSIONAUTH_PUBLIC_URL),
            bind_address: get(BIND_ADDRESS),
            postgres_password: get(POSTGRES_PASSWORD),
            fusionauth_db_password: get(FUSIONAUTH_DB_PASSWORD),
            fusionauth_admin_password: get(FUSIONAUTH_ADMIN_PASSWORD),
            internal_auth_key: get(INTERNAL_AUTH_KEY),
            fusionauth_api_key: get(FUSIONAUTH_API_KEY),
        }
    }

    /// Read the settings back from a resolved env.
    pub fn from_env(env: &BTreeMap<String, String>) -> Self {
        Self::from_lookup(|key| env.get(key).cloned())
    }

    /// Whether the stack serves a public origin rather than localhost.
    pub fn is_public(&self) -> bool {
        self.public_origin.is_some()
    }

    pub fn postgres_password(&self) -> &str {
        self.postgres_password
            .as_deref()
            .unwrap_or(DEFAULT_POSTGRES_PASSWORD)
    }

    pub fn internal_auth_key(&self) -> &str {
        self.internal_auth_key
            .as_deref()
            .unwrap_or(identity::INTERNAL_AUTH_KEY)
    }

    pub fn fusionauth_api_key(&self) -> &str {
        self.fusionauth_api_key
            .as_deref()
            .unwrap_or(identity::FUSIONAUTH_API_KEY)
    }

    /// The Macro database URL on `host_port` (`postgres:5432` in-network,
    /// `localhost:<port>` from the host).
    pub fn database_url(&self, host_port: &str) -> String {
        format!(
            "postgres://user:{}@{host_port}/macrodb",
            self.postgres_password()
        )
    }

    /// A compose short port mapping, bound to [`Self::bind_address`] when set.
    pub fn publish(&self, mapping: String) -> String {
        match &self.bind_address {
            Some(address) => format!("{address}:{mapping}"),
            None => mapping,
        }
    }

    /// Write the `MACRO_*` settings that are set into `env`, so later steps
    /// can read them back with [`Self::from_env`] and compose can interpolate
    /// them.
    pub fn write(&self, env: &mut BTreeMap<String, String>) {
        let values = [
            &self.public_origin,
            &self.fusionauth_public_url,
            &self.bind_address,
            &self.postgres_password,
            &self.fusionauth_db_password,
            &self.fusionauth_admin_password,
        ];
        for (key, value) in KEYS.into_iter().zip(values) {
            if let Some(value) = value {
                env.insert(key.to_owned(), value.clone());
            }
        }
    }
}

/// Refuse a public stack that still carries a checked-in local secret: each
/// of these lets anyone who reads this repository sign in as, or act for, any
/// user. `fixtures` is the env the stack would have without overrides.
pub fn ensure_no_fixture_secrets(
    env: &BTreeMap<String, String>,
    fixtures: &BTreeMap<String, String>,
) -> Result<()> {
    if !SelfHost::from_env(env).is_public() {
        return Ok(());
    }
    let mut fixed: Vec<&str> = PUBLIC_SECRETS
        .iter()
        .copied()
        .filter(|key| env.get(*key).is_none() || env.get(*key) == fixtures.get(*key))
        .collect();
    if !env.contains_key(FUSIONAUTH_ADMIN_PASSWORD) {
        fixed.push(FUSIONAUTH_ADMIN_PASSWORD);
    }
    if !fixed.is_empty() {
        bail!(
            "{PUBLIC_ORIGIN} is set but these still have their local development values; \
             set them in --env-file: {}",
            fixed.join(", ")
        );
    }
    Ok(())
}

/// The secrets a public stack must override, by the key that carries each.
const PUBLIC_SECRETS: [&str; 11] = [
    INTERNAL_AUTH_KEY,
    FUSIONAUTH_API_KEY,
    "FUSIONAUTH_CLIENT_SECRET_KEY",
    "JWT_SECRET_KEY",
    "MACRO_API_TOKEN_PRIVATE_SECRET_KEY",
    "MACRO_API_TOKEN_PUBLIC_KEY",
    "DOCUMENT_PERMISSION_JWT",
    "INTERNAL_CALL_SECRET",
    "URL_SIGNING_HMAC",
    "ACCOUNT_LINK_STATE_SECRET",
    "MCP_CREDENTIALS_KEY_SECRET_NAME",
];
