//! A thin wrapper over the `cua` CLI.
//!
//! The CLI rather than the daemon's gRPC API, for the reason the local
//! provider drives `docker`: the verbs below are the whole of what a sandbox
//! needs, and the CLI already finds the runtime, the daemon (`CUA_DAEMON`) or
//! the embedded engine. Every verb builds its argument list in a pure
//! function so the wiring can be asserted without a runtime.

use std::process::Stdio;
use std::time::Duration;

use serde::Deserialize;
use tokio::io::AsyncWriteExt as _;

use super::errors::CuaError;

#[cfg(test)]
mod test;

/// The named service Cua publishes the sidecar port as.
pub(crate) const SIDECAR_SERVICE: &str = "sidecar";

/// `cua-spacesd`'s port; a Space is usable once it answers.
const SPACESD_PORT: u16 = 3211;

/// Exit status `cua` uses for a sandbox it does not know.
const NOT_FOUND_STATUS: i32 = 3;

/// Exit status `cua sb exec` uses for a command that ran out of time.
const TIMEOUT_STATUS: i32 = 124;

/// Extra time the process gets beyond the in-Space time limit, for `cua`
/// itself to report the timeout.
const EXEC_GRACE: Duration = Duration::from_secs(10);

/// What a Space should be created with.
#[derive(Debug, Clone)]
pub(crate) struct CreateSpec {
    /// Image to run. It must carry `cua-spacesd` (see `container/cua.Dockerfile`).
    pub image: String,
    /// Space name, deterministic per session.
    pub name: String,
    /// Cua engine: `runc`, `gvisor`, `firecracker`, or `auto`.
    pub runtime: String,
    /// vCPUs.
    pub cpus: u32,
    /// Memory in GiB.
    pub memory_gib: u32,
    /// The sidecar port, published as [`SIDECAR_SERVICE`].
    pub sidecar_port: u16,
}

/// One Space as `cua sb info --json` and `cua sb ls --json` describe it.
#[derive(Debug, Clone, Deserialize)]
pub(crate) struct SpaceInfo {
    /// The Space's name.
    pub name: String,
    /// `running`, `stopped`, `suspended`, ...
    #[serde(default)]
    pub state: String,
}

#[derive(Debug, Deserialize)]
struct ServiceUrl {
    url: String,
}

/// Drives `cua`.
#[derive(Debug, Clone)]
pub(crate) struct Cua {
    binary: String,
}

impl Cua {
    /// Wrap a `cua` binary.
    pub fn new(binary: impl Into<String>) -> Self {
        Self {
            binary: binary.into(),
        }
    }

    /// Create a Space and wait until `cua-spacesd` answers in it.
    pub async fn create(&self, spec: &CreateSpec) -> Result<(), CuaError> {
        self.run_checked("sandbox create", &create_args(spec))
            .await
            .map(drop)
    }

    /// The Space called `name`, running or not.
    pub async fn info(&self, name: &str) -> Result<Option<SpaceInfo>, CuaError> {
        let output = self.output(&info_args(name), None).await?;
        if output.status.code() == Some(NOT_FOUND_STATUS) {
            return Ok(None);
        }
        let stdout = checked("sandbox info", output)?;
        serde_json::from_str(&stdout)
            .map(Some)
            .map_err(|source| CuaError::Parse {
                command: "sandbox info".to_owned(),
                source,
            })
    }

    /// Run one shell command in a Space, returning its status and combined
    /// output. A non-zero exit is the caller's to judge, as with `docker exec`.
    pub async fn exec(
        &self,
        name: &str,
        command: &str,
        timeout: Duration,
    ) -> Result<(i32, String), CuaError> {
        let timed_out = || CuaError::ExecTimeout {
            space: name.to_owned(),
            seconds: timeout.as_secs(),
        };
        let output = tokio::time::timeout(
            timeout + EXEC_GRACE,
            self.output(&exec_args(name, command, timeout), None),
        )
        .await
        .map_err(|_| timed_out())??;

        let status = output.status.code().unwrap_or(-1);
        if status == TIMEOUT_STATUS {
            return Err(timed_out());
        }
        let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
        combined.push_str(&String::from_utf8_lossy(&output.stderr));
        Ok((status, combined))
    }

    /// Write `contents` to `path` in a Space, readable by root only.
    ///
    /// The bytes travel on the command's stdin, so nothing written here shows
    /// up in the host's process list the way an argument would.
    pub async fn write_private_file(
        &self,
        name: &str,
        path: &str,
        contents: &[u8],
    ) -> Result<(), CuaError> {
        let output = self
            .output(&write_private_file_args(name, path), Some(contents))
            .await?;
        checked("sandbox exec --stdin", output).map(drop)
    }

    /// The URL this host reaches a Space's named service at.
    pub async fn service_url(&self, name: &str, service: &str) -> Result<String, CuaError> {
        let stdout = self
            .run_checked("sandbox url", &service_url_args(name, service))
            .await?;
        serde_json::from_str::<ServiceUrl>(&stdout)
            .map(|answer| answer.url)
            .map_err(|source| CuaError::Parse {
                command: "sandbox url".to_owned(),
                source,
            })
    }

    /// Turn a stopped or suspended Space back on.
    pub async fn start(&self, name: &str) -> Result<(), CuaError> {
        self.run_checked("spaces start", &start_args(name))
            .await
            .map(drop)
    }

    /// Delete a Space for good, running or not.
    pub async fn remove(&self, name: &str) -> Result<(), CuaError> {
        self.run_checked("sandbox rm", &remove_args(name))
            .await
            .map(drop)
    }

    /// Every local Space.
    pub async fn list(&self) -> Result<Vec<SpaceInfo>, CuaError> {
        let stdout = self.run_checked("sandbox ls", &list_args()).await?;
        serde_json::from_str(&stdout).map_err(|source| CuaError::Parse {
            command: "sandbox ls".to_owned(),
            source,
        })
    }

    async fn run_checked(&self, command: &str, args: &[String]) -> Result<String, CuaError> {
        checked(command, self.output(args, None).await?)
    }

    async fn output(
        &self,
        args: &[String],
        stdin: Option<&[u8]>,
    ) -> Result<std::process::Output, CuaError> {
        let spawn_error = |source| CuaError::Spawn {
            binary: self.binary.clone(),
            source,
        };
        let mut command = tokio::process::Command::new(&self.binary);
        command
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(if stdin.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .kill_on_drop(true);
        let mut child = command.spawn().map_err(spawn_error)?;
        if let Some(bytes) = stdin
            && let Some(mut pipe) = child.stdin.take()
        {
            pipe.write_all(bytes).await.map_err(spawn_error)?;
            // Dropping the pipe closes it: the command sees end of input.
        }
        child.wait_with_output().await.map_err(spawn_error)
    }
}

fn checked(command: &str, output: std::process::Output) -> Result<String, CuaError> {
    if !output.status.success() {
        return Err(CuaError::Command {
            command: command.to_owned(),
            status: output.status.code().unwrap_or(-1),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Quote `value` as one POSIX shell word.
pub(crate) fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

/// `cua sb create` for one session's Space.
///
/// `--headless`: a sandbox needs exec, files and ports, not a desktop.
/// No `--env`: secrets would show in the host's process list; the manager
/// writes them into the Space over stdin instead.
fn create_args(spec: &CreateSpec) -> Vec<String> {
    vec![
        "sandbox".to_owned(),
        "create".to_owned(),
        spec.image.clone(),
        "--name".to_owned(),
        spec.name.clone(),
        "--runtime".to_owned(),
        spec.runtime.clone(),
        "--headless".to_owned(),
        "--cpu".to_owned(),
        spec.cpus.to_string(),
        "--memory".to_owned(),
        format!("{}GB", spec.memory_gib),
        "--service".to_owned(),
        format!("{SIDECAR_SERVICE}={}", spec.sidecar_port),
        "--wait".to_owned(),
        format!("tcp:{SPACESD_PORT}"),
        "--json".to_owned(),
    ]
}

/// `cua sb exec` running one command through a login shell, as the other
/// providers do: the image puts its baked nix dev shell on `PATH` through
/// `BASH_ENV`, which a non-login shell would skip.
fn exec_args(name: &str, command: &str, timeout: Duration) -> Vec<String> {
    vec![
        "sandbox".to_owned(),
        "exec".to_owned(),
        "--local".to_owned(),
        "--timeout".to_owned(),
        timeout.as_secs().max(1).to_string(),
        name.to_owned(),
        format!("bash -lc {}", shell_quote(command)),
    ]
}

/// `cua sb exec --stdin` writing its input to a root-only file.
fn write_private_file_args(name: &str, path: &str) -> Vec<String> {
    vec![
        "sandbox".to_owned(),
        "exec".to_owned(),
        "--local".to_owned(),
        "--stdin".to_owned(),
        name.to_owned(),
        "sh".to_owned(),
        "-c".to_owned(),
        format!("umask 077 && cat > {}", shell_quote(path)),
    ]
}

fn info_args(name: &str) -> Vec<String> {
    vec![
        "sandbox".to_owned(),
        "info".to_owned(),
        "--local".to_owned(),
        "--json".to_owned(),
        name.to_owned(),
    ]
}

fn service_url_args(name: &str, service: &str) -> Vec<String> {
    vec![
        "sandbox".to_owned(),
        "url".to_owned(),
        "--local".to_owned(),
        "--json".to_owned(),
        name.to_owned(),
        service.to_owned(),
    ]
}

fn start_args(name: &str) -> Vec<String> {
    vec!["spaces".to_owned(), "start".to_owned(), name.to_owned()]
}

/// `--force`: without a terminal `cua` refuses to delete anything otherwise.
fn remove_args(name: &str) -> Vec<String> {
    vec![
        "sandbox".to_owned(),
        "rm".to_owned(),
        "--local".to_owned(),
        "--force".to_owned(),
        name.to_owned(),
    ]
}

fn list_args() -> Vec<String> {
    vec![
        "sandbox".to_owned(),
        "ls".to_owned(),
        "--local".to_owned(),
        "--json".to_owned(),
    ]
}
