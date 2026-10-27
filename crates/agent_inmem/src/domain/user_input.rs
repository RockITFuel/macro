//! Port for asking the user for information during an agent turn.

use std::sync::Arc;

use async_trait::async_trait;

/// A single question the agent needs the user to answer.
///
/// With no options it asks for free text. With options it is a choice: one
/// option, or several when `multi_select` is set, and with `allow_other` the
/// user may type their own answer instead.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserInputRequest {
    /// The question shown to the user.
    pub question: String,
    /// A short label for the question (a chip such as "Auth method").
    pub header: Option<String>,
    /// Allowed answers. An empty list requests free text.
    pub options: Vec<UserInputOption>,
    /// Whether the user may pick more than one option.
    pub multi_select: bool,
    /// Whether the user may type their own answer instead of the options.
    pub allow_other: bool,
}

impl UserInputRequest {
    /// A free-text question.
    #[must_use]
    pub fn free_text(question: impl Into<String>) -> Self {
        Self {
            question: question.into(),
            header: None,
            options: Vec::new(),
            multi_select: false,
            allow_other: false,
        }
    }

    /// A single-choice question over plain labels, with no "Other" answer.
    #[must_use]
    pub fn choice(question: impl Into<String>, labels: Vec<String>) -> Self {
        Self {
            options: labels.into_iter().map(UserInputOption::label).collect(),
            ..Self::free_text(question)
        }
    }
}

/// One answer the user can pick.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserInputOption {
    /// The answer as shown and as returned when chosen.
    pub label: String,
    /// What choosing it means, shown under the label.
    pub description: Option<String>,
    /// A monospace sketch shown while the option is chosen (a layout, a
    /// snippet, a table), so options can be compared side by side.
    pub preview: Option<String>,
}

impl UserInputOption {
    /// An option with only a label.
    #[must_use]
    pub fn label(label: impl Into<String>) -> Self {
        Self {
            label: label.into(),
            description: None,
            preview: None,
        }
    }
}

/// What the user answered.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct UserInputAnswer {
    /// The chosen option labels, in the order offered.
    pub selected: Vec<String>,
    /// Text the user typed: the answer to a free-text question, or their own
    /// answer instead of the options.
    pub other: Option<String>,
}

impl UserInputAnswer {
    /// A single chosen option.
    #[must_use]
    pub fn option(label: impl Into<String>) -> Self {
        Self {
            selected: vec![label.into()],
            other: None,
        }
    }

    /// Typed text.
    #[must_use]
    pub fn text(text: impl Into<String>) -> Self {
        Self {
            selected: Vec::new(),
            other: Some(text.into()),
        }
    }
}

impl std::fmt::Display for UserInputAnswer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut parts = self.selected.iter().map(String::as_str).collect::<Vec<_>>();
        if let Some(other) = &self.other {
            parts.push(other);
        }
        f.write_str(&parts.join(", "))
    }
}

/// How the user resolved a question.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UserInputOutcome {
    /// The user supplied an answer.
    Answered(UserInputAnswer),
    /// The user explicitly declined to answer.
    Declined,
    /// The question was dismissed or the turn was stopped.
    Cancelled,
}

/// Failure to ask or decode a user-input request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UserInputError {
    /// The connected ACP client did not advertise form elicitation.
    Unsupported,
    /// The client or transport refused the request.
    RequestFailed(String),
    /// The client accepted the form without returning its answer.
    MissingAnswer,
    /// The client returned a value outside the requested field schema.
    InvalidAnswer(String),
}

impl std::fmt::Display for UserInputError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unsupported => f.write_str("the client does not support form elicitation"),
            Self::RequestFailed(message) => write!(f, "the client refused the question: {message}"),
            Self::MissingAnswer => f.write_str("the client accepted without returning an answer"),
            Self::InvalidAnswer(message) => {
                write!(f, "the client returned an invalid answer: {message}")
            }
        }
    }
}

impl std::error::Error for UserInputError {}

/// Capability used by a turn to ask its connected user a question.
#[async_trait]
pub trait UserInputRequester: Send + Sync {
    /// Ask one question and wait for the user's decision.
    async fn ask(&self, request: UserInputRequest) -> Result<UserInputOutcome, UserInputError>;
}

/// Shared requester carried into model-callable tools.
pub type SharedUserInputRequester = Arc<dyn UserInputRequester>;
