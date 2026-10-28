//! Macro Internal MCP tools for agent sessions.

mod coding_agents;
mod context;
mod link_task;
mod read_agent_session;
mod set_pull_request;
mod task_pull_requests;
mod wait_agent_session;

pub use coding_agents::{
    CodingAgentToolContext, DispatchCodingAgent, ListCodingAgents, ListCodingAgentsResponse,
    coding_agent_toolset,
};
pub use context::SessionToolContext;
pub use link_task::LinkTask;
pub use read_agent_session::{ReadAgentSession, ReadAgentSessionContext};
pub use set_pull_request::SetPullRequest;
pub use task_pull_requests::TaskPullRequestsTool;
pub use wait_agent_session::WaitAgentSession;

mod manage_agent_session;

mod sharing;
pub use sharing::{ReadAgentSessionSharing, UpdateAgentSessionSharing};
