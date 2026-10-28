//! Failures the Cua provider can produce.

use thiserror::Error;

/// Something went wrong driving Cua Spaces.
#[derive(Debug, Error)]
pub enum CuaError {
    /// The `cua` binary could not be run at all.
    #[error("could not run `{binary}`: {source}")]
    Spawn {
        /// The binary we tried to run.
        binary: String,
        /// Why it could not be run.
        #[source]
        source: std::io::Error,
    },

    /// `cua` ran and refused.
    #[error("`cua {command}` failed with status {status}: {stderr}")]
    Command {
        /// The subcommand, for a message that says which step broke.
        command: String,
        /// Exit status `cua` reported.
        status: i32,
        /// Whatever `cua` said about it.
        stderr: String,
    },

    /// `cua` answered with JSON this provider does not understand.
    #[error("could not read the output of `cua {command}`: {source}")]
    Parse {
        /// The subcommand whose output did not parse.
        command: String,
        /// Why it did not parse.
        #[source]
        source: serde_json::Error,
    },

    /// A command in a Space outlived its timeout.
    #[error("a command in Space {space} did not finish within {seconds}s")]
    ExecTimeout {
        /// Space the command was running in.
        space: String,
        /// How long it was given.
        seconds: u64,
    },

    /// The readiness recipe ran and failed inside the Space.
    #[error("readiness recipe failed in Space {space} with status {status}: {output}")]
    ReadinessRecipe {
        /// Space the recipe ran in.
        space: String,
        /// Exit status of the recipe.
        status: i32,
        /// Combined output, for the person reading the log.
        output: String,
    },

    /// The sidecar never answered its readiness probe.
    #[error("sidecar in Space {space} was not ready within {seconds}s")]
    NotReady {
        /// Space whose sidecar stayed silent.
        space: String,
        /// How long we waited.
        seconds: u64,
    },

    /// Cua gave the sidecar a URL that is not plain HTTP.
    #[error("unexpected sidecar URL {url}")]
    ServiceUrl {
        /// What Cua answered.
        url: String,
    },

    /// The sidecar socket could not be dialed.
    #[error("could not dial the sidecar at {url}: {source}")]
    WebSocketConnect {
        /// Address we dialed.
        url: String,
        /// Why the dial failed.
        #[source]
        source: tokio_tungstenite::tungstenite::Error,
    },
}
