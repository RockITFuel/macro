use std::time::Duration;

use agent_session::domain::model::{AgentSessionId, SandboxSize};

use super::cli::{CreateSpec, Cua, SIDECAR_SERVICE, shell_quote};
use super::errors::CuaError;
use crate::domain::error::{HarnessError, Result};
use crate::domain::model::{SandboxEgress, SpawnContainer};
use crate::domain::ports::ContainerManager;
use crate::domain::sandbox::{SandboxResizeEffect, create_only_resize_effect, resources};
use crate::outbound::daytona::AnthropicApiKey;
use crate::outbound::provision;
use crate::outbound::sidecar::SidecarTransport;

#[cfg(test)]
mod test;

/// How long to keep asking the sidecar whether it is up.
const PING_INTERVAL: Duration = Duration::from_millis(250);

/// Short commands: reading the token back, tailing a log.
const SHORT_EXEC: Duration = Duration::from_secs(15);

/// Prefix of every Space this provider owns, so shutdown finds them and
/// `cua sb ls` reads legibly.
const SPACE_PREFIX: &str = "macro-agent-";

/// Where the sandbox environment lives inside a Space (root-only).
///
/// `cua sb create --env` would put the Anthropic key and the session token on
/// the host's command line, so they are written here over stdin instead, and
/// every command the harness runs sources this file first.
const ENV_FILE: &str = "/etc/macro-sandbox.env";

/// Settings for the Cua-backed provider.
pub struct CuaSettings {
    /// The `cua` binary to drive.
    pub binary: String,
    /// Image Spaces are created from; it must carry `cua-spacesd`.
    pub image: String,
    /// Cua engine (`runc`, `gvisor`, `firecracker`, or `auto`).
    pub runtime: String,
    /// Key sandboxes run Anthropic models with.
    pub anthropic_api_key: AnthropicApiKey,
}

/// Hands out one fresh Cua Space per session.
///
/// The same shape as the local Docker provider: the same image, the same
/// readiness recipe, the same sidecar. Teardown and [`Self::shutdown_all`]
/// delete Spaces, so nothing outlives a deleted session or a stopped harness.
#[derive(Clone)]
pub struct CuaContainerManager {
    cua: Cua,
    image: String,
    runtime: String,
    anthropic_api_key: AnthropicApiKey,
}

impl CuaContainerManager {
    /// Build the manager from its settings.
    #[must_use]
    pub fn new(settings: CuaSettings) -> Self {
        let CuaSettings {
            binary,
            image,
            runtime,
            anthropic_api_key,
        } = settings;
        Self {
            cua: Cua::new(binary),
            image,
            runtime,
            anthropic_api_key,
        }
    }

    /// Delete every Space this provider still owns, returning how many refused.
    pub async fn shutdown_all(&self) -> usize {
        let spaces = match self.cua.list().await {
            Ok(spaces) => spaces,
            Err(error) => {
                tracing::error!(error = ?error, "failed to list Cua Spaces for shutdown");
                return 1;
            }
        };

        let mut failures = 0;
        for space in spaces.iter().filter(|space| owned(&space.name)) {
            if let Err(error) = self.cua.remove(&space.name).await {
                tracing::error!(error = ?error, space = %space.name, "failed to delete a Cua Space on shutdown");
                failures += 1;
            }
        }
        failures
    }

    /// Run the readiness recipe, then dial the sidecar behind it.
    async fn bring_up(&self, space: &str) -> Result<SidecarTransport> {
        let (status, output) = self
            .cua
            .exec(
                space,
                &with_sandbox_env(&provision::ensure_ready_command()),
                provision::ENSURE_TIMEOUT,
            )
            .await
            .map_err(unavailable)?;
        if status != 0 {
            return Err(unavailable(CuaError::ReadinessRecipe {
                space: space.to_owned(),
                status,
                output,
            }));
        }
        tracing::info!(%space, %output, "readiness recipe finished");

        let base = self
            .cua
            .service_url(space, SIDECAR_SERVICE)
            .await
            .map_err(unavailable)?;
        let url = websocket_url(&base).map_err(unavailable)?;
        self.wait_for_ping(space, &base).await?;

        let (socket, _) = tokio_tungstenite::connect_async(&url)
            .await
            .map_err(|source| {
                unavailable(CuaError::WebSocketConnect {
                    url: url.clone(),
                    source,
                })
            })?;
        Ok(SidecarTransport::connect(socket))
    }

    /// Poll the sidecar's `/ping` until it answers or we give up.
    ///
    /// The recipe backgrounds the sidecar, so it returns before the sidecar
    /// listens; dialing at once would race it.
    async fn wait_for_ping(&self, space: &str, base: &str) -> Result<()> {
        let client = reqwest::Client::new();
        let url = format!("{}/ping", base.trim_end_matches('/'));
        let deadline = tokio::time::Instant::now() + provision::PING_TIMEOUT;

        while tokio::time::Instant::now() < deadline {
            if let Ok(response) = client.get(&url).send().await
                && response.status().is_success()
            {
                return Ok(());
            }
            tokio::time::sleep(PING_INTERVAL).await;
        }

        if let Ok((_status, log)) = self
            .cua
            .exec(
                space,
                &format!("tail -50 {} 2>&1 || true", provision::SIDECAR_LOG),
                SHORT_EXEC,
            )
            .await
        {
            tracing::error!(%space, sidecar_log = %log, "sidecar log");
        }

        Err(unavailable(CuaError::NotReady {
            space: space.to_owned(),
            seconds: provision::PING_TIMEOUT.as_secs(),
        }))
    }

    async fn exists(&self, space: &str) -> Result<Option<String>> {
        self.cua
            .info(space)
            .await
            .map(|info| info.map(|info| info.state))
            .map_err(unavailable)
    }

    /// Delete a Space that never came up, so a retry is not blocked by the
    /// name it already took.
    async fn discard(&self, space: &str) {
        let _ = self.cua.remove(space).await.inspect_err(|error| {
            tracing::error!(error = ?error, %space, "failed to delete a Cua Space that never came up");
        });
    }
}

impl ContainerManager for CuaContainerManager {
    type Transport = SidecarTransport;

    // `skip_all`: `SpawnContainer` carries the egress session token; nothing
    // secret-bearing may be Debug-recorded into the span.
    #[tracing::instrument(err, skip_all, fields(session_id = %command.session_id))]
    async fn spawn(
        &self,
        command: SpawnContainer,
    ) -> Result<agent_session::domain::connection::RuntimeAttachment<Self::Transport>> {
        let SpawnContainer {
            session_id,
            kind: _,
            size,
            egress,
            ..
        } = command;
        let space = space_name(session_id);

        // A previous run of the same session leaves a Space holding this name.
        if self.exists(&space).await?.is_some() {
            tracing::warn!(%space, session = %session_id, "deleting a stale Cua Space for a session being spawned");
            self.discard(&space).await;
        }

        let quota = resources(size);
        let spec = CreateSpec {
            image: self.image.clone(),
            name: space.clone(),
            runtime: self.runtime.clone(),
            cpus: quota.cpu,
            memory_gib: quota.memory_gib,
            sidecar_port: provision::SIDECAR_PORT,
        };
        self.cua.create(&spec).await.map_err(unavailable)?;
        tracing::info!(%space, session = %session_id, "Cua Space created");

        let env = env_file(&sandbox_env(&self.anthropic_api_key, egress));
        let ready = async {
            self.cua
                .write_private_file(&space, ENV_FILE, env.as_bytes())
                .await
                .map_err(unavailable)?;
            self.bring_up(&space).await
        };
        match ready.await {
            Ok(transport) => Ok(agent_session::domain::connection::RuntimeAttachment::solo(
                transport,
            )),
            Err(error) => {
                self.discard(&space).await;
                Err(error)
            }
        }
    }

    fn resize_effect(&self, from: SandboxSize, to: SandboxSize) -> SandboxResizeEffect {
        create_only_resize_effect(from, to)
    }

    async fn resize(&self, _session: AgentSessionId, _size: SandboxSize) -> Result<()> {
        Err(HarnessError::Container(
            "Cua Spaces cannot be resized in place".to_owned(),
        ))
    }

    #[tracing::instrument(err, skip(self))]
    async fn resume(
        &self,
        session: AgentSessionId,
    ) -> Result<agent_session::domain::connection::RuntimeAttachment<Self::Transport>> {
        let space = space_name(session);
        let state = self.exists(&space).await?.ok_or_else(|| {
            HarnessError::Container(format!("session {session} has no Cua Space to resume"))
        })?;
        if state != "running" {
            self.cua.start(&space).await.map_err(unavailable)?;
        }
        self.bring_up(&space)
            .await
            .map(agent_session::domain::connection::RuntimeAttachment::solo)
    }

    #[tracing::instrument(err, skip(self))]
    async fn session_token(&self, session: AgentSessionId) -> Result<Option<String>> {
        let space = space_name(session);
        if self.exists(&space).await?.is_none() {
            return Ok(None);
        }
        let (status, output) = self
            .cua
            .exec(
                &space,
                &with_sandbox_env(&provision::session_token_command()),
                SHORT_EXEC,
            )
            .await
            .map_err(unavailable)?;
        if status != 0 {
            return Ok(None);
        }
        Ok(provision::parse_session_token(&output))
    }

    #[tracing::instrument(err, skip(self))]
    async fn teardown(&self, session: AgentSessionId) -> Result<()> {
        let space = space_name(session);
        if self.exists(&space).await?.is_none() {
            return Ok(());
        }
        self.cua.remove(&space).await.map_err(unavailable)?;
        tracing::info!(%space, %session, "Cua Space deleted");
        Ok(())
    }
}

/// The Space name for a session: deterministic, so a session has at most one.
fn space_name(session: AgentSessionId) -> String {
    format!("{SPACE_PREFIX}{session}")
}

fn owned(space: &str) -> bool {
    space.starts_with(SPACE_PREFIX)
}

/// The same environment the other providers hand a sandbox.
fn sandbox_env(
    anthropic_api_key: &AnthropicApiKey,
    egress: SandboxEgress,
) -> Vec<(String, String)> {
    let mut env = vec![(
        "ANTHROPIC_API_KEY".to_owned(),
        anthropic_api_key.expose().to_owned(),
    )];
    env.extend(egress.environment());
    env
}

/// `env` as a file of `export KEY='value'` lines for `sh` to source.
fn env_file(env: &[(String, String)]) -> String {
    env.iter()
        .map(|(key, value)| format!("export {key}={}\n", shell_quote(value)))
        .collect()
}

/// `command` with the sandbox environment loaded first.
fn with_sandbox_env(command: &str) -> String {
    format!("set -a; . {ENV_FILE}; set +a; {command}")
}

/// The sidecar's WebSocket URL from the HTTP URL Cua publishes it at.
fn websocket_url(base: &str) -> std::result::Result<String, CuaError> {
    base.strip_prefix("http://")
        .map(|rest| format!("ws://{}", rest.trim_end_matches('/')))
        .ok_or_else(|| CuaError::ServiceUrl {
            url: base.to_owned(),
        })
}

fn unavailable(error: CuaError) -> HarnessError {
    HarnessError::Container(error.to_string())
}
