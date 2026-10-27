//! FusionAuth adapter for the MCP OAuth broker.

use anyhow::Context;
use std::sync::Arc;
use tracing::Instrument;

#[cfg(test)]
mod test;

use crate::domain::{
    models::{RefreshToken, UpstreamTokens},
    ports::{OAuthProvider, UpstreamTokensFuture},
};

/// FusionAuth-backed OAuth provider for the MCP auth proxy.
#[derive(Clone)]
pub struct FusionAuthOAuthProvider {
    client: Arc<fusionauth::FusionAuthClient>,
    /// Absent when FusionAuth has no `google_gmail` provider, as on a local
    /// or self-hosted stack without a Google client: MCP sign-in is then
    /// refused while the rest of the service runs.
    google_idp_id: Option<String>,
}

impl FusionAuthOAuthProvider {
    /// Creates a provider and resolves the Google identity provider ID.
    #[tracing::instrument(skip(client), err)]
    pub async fn new(client: fusionauth::FusionAuthClient) -> anyhow::Result<Self> {
        let google_idp_id = match client
            .get_identity_provider_id_by_name("google_gmail")
            .await
        {
            Ok(id) => {
                tracing::debug!(google_idp_id = %id, "resolved Google IDP ID from FusionAuth");
                Some(id)
            }
            Err(fusionauth::error::FusionAuthClientError::NoIdentityProviderFound) => {
                tracing::warn!(
                    "FusionAuth has no google_gmail identity provider; MCP OAuth sign-in is unavailable"
                );
                None
            }
            Err(error) => {
                return Err(anyhow::Error::from(error))
                    .context("failed to look up Google Gmail identity provider in FusionAuth");
            }
        };

        Ok(Self {
            client: Arc::new(client),
            google_idp_id,
        })
    }
}

impl OAuthProvider for FusionAuthOAuthProvider {
    #[tracing::instrument(skip(self), err)]
    fn construct_authorize_url(&self, state: &str) -> anyhow::Result<String> {
        let google_idp_id = self.google_idp_id.as_deref().context(
            "MCP OAuth sign-in needs FusionAuth's google_gmail identity provider (a Google client)",
        )?;
        self.client
            .construct_oauth2_authorize_url(google_idp_id, None, Some(state.to_owned()))
    }

    fn exchange_authorization_code<'a>(&'a self, code: &'a str) -> UpstreamTokensFuture<'a> {
        let span = tracing::debug_span!("FusionAuthOAuthProvider::exchange_authorization_code");
        Box::pin(
            async move {
                let grant = self
                    .client
                    .complete_authorization_code_grant(code)
                    .await
                    .map_err(anyhow::Error::from)?;

                Ok(UpstreamTokens {
                    access_token: grant.access_token.into(),
                    refresh_token: grant.refresh_token.into(),
                    expires_in: grant.expires_in,
                })
            }
            .instrument(span),
        )
    }

    fn refresh_access_token<'a>(
        &'a self,
        refresh_token: &'a RefreshToken,
    ) -> UpstreamTokensFuture<'a> {
        let span = tracing::debug_span!("FusionAuthOAuthProvider::refresh_access_token");
        Box::pin(
            async move {
                let grant = self
                    .client
                    .complete_refresh_token_grant(refresh_token.as_str())
                    .await
                    .map_err(anyhow::Error::from)?;

                Ok(UpstreamTokens {
                    access_token: grant.access_token.into(),
                    refresh_token: grant.refresh_token.into(),
                    expires_in: grant.expires_in,
                })
            }
            .instrument(span),
        )
    }
}
