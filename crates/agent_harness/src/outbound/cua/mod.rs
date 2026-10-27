//! Sandboxes as Cua Spaces (<https://github.com/trycua/cua>), driven through
//! the `cua` CLI.
//!
//! A pilot next to Daytona and local Docker, selected with
//! `MACRO_SANDBOX_RUNTIME=cua`. Each session gets a fresh Space built from
//! the same sandbox image, so the readiness recipe and the sidecar are the
//! ones every other provider runs.
//!
//! Cua publishes a local Space's ports on the host's loopback only, and the
//! CLI reaches `cua-spacesd` there too, so the harness must share the host's
//! network namespace with the Cua runtime (a host process, or a container
//! with `network_mode: host`).

mod cli;
mod errors;
mod manager;

pub use errors::CuaError;
pub use manager::{CuaContainerManager, CuaSettings};
