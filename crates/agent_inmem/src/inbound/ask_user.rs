//! Model-callable adapter for ACP elicitation.

use ai_toolset::{
    AsyncTool, RequestContext, ServiceContext, ToolAnnotated, ToolAnnotations, ToolCallError,
    ToolResult,
};
use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{Deserialize, Deserializer, Serialize};
use tokio::select;

use crate::domain::user_input::{
    SharedUserInputRequester, UserInputOption, UserInputOutcome, UserInputRequest,
};

/// Fewest options a choice offers; one option is not a choice.
const MIN_OPTIONS: usize = 2;
/// Most options a choice offers, so the card stays scannable on a phone.
const MAX_OPTIONS: usize = 4;
/// Longest header, in characters: it is a chip, not a sentence.
const MAX_HEADER_CHARS: usize = 40;
/// Longest option label, in characters.
const MAX_LABEL_CHARS: usize = 120;
/// Longest option description, in characters.
const MAX_DESCRIPTION_CHARS: usize = 400;
/// Longest option preview, in characters.
const MAX_PREVIEW_CHARS: usize = 4_000;

/// Context required by [`AskUser`].
#[derive(Clone)]
pub struct AskUserContext {
    /// The active session's user-input port.
    pub requester: Option<SharedUserInputRequester>,
}

/// Ask the user one blocking question.
#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(
    title = "AskUser",
    description = "Ask the user one question and wait for the answer. Use it when a decision or fact you cannot infer safely blocks the work: choosing between approaches, confirming scope, picking from real alternatives. Offer 2-4 options for a choice (the user can also type their own answer unless allowOther is false), set multiSelect when several can apply, or pass no options for free text. Put the recommended option first and say so in its description. Give an option a preview to show a sketch (layout, snippet, table) while it is chosen. Never request passwords, API keys, authentication codes, payment details, or other secrets."
)]
#[serde(rename_all = "camelCase")]
pub struct AskUser {
    /// The complete, concise question shown to the user.
    #[schemars(description = "The complete, concise question shown to the user.")]
    pub question: String,
    /// A short chip label for the question.
    #[serde(default)]
    #[schemars(
        description = "A very short label for the question, at most 40 characters, such as \"Auth method\" or \"Library\"."
    )]
    pub header: Option<String>,
    /// The choices.
    #[serde(default)]
    #[schemars(
        description = "2-4 distinct choices for the user. Omit or pass an empty list to request free text."
    )]
    pub options: Vec<AskUserOption>,
    /// Whether several options may be chosen.
    #[serde(default)]
    #[schemars(
        description = "Let the user choose more than one option. Use it when the choices are not mutually exclusive."
    )]
    pub multi_select: bool,
    /// Whether the user may type their own answer.
    #[serde(default = "default_true")]
    #[schemars(
        description = "Let the user type their own answer instead of choosing (an \"Other\" field). Defaults to true; set false only when nothing but the options can work."
    )]
    pub allow_other: bool,
}

fn default_true() -> bool {
    true
}

/// One choice offered to the user.
///
/// Deserializes from a bare string too: earlier `AskUser` calls passed plain
/// labels, and transcripts replay them.
#[derive(Debug, Clone, PartialEq, Eq, JsonSchema)]
pub struct AskUserOption {
    /// The answer as shown, and as returned when chosen.
    #[schemars(description = "The choice as shown to the user, 1-5 words.")]
    pub label: String,
    /// What the choice means.
    #[schemars(description = "What choosing this means or what happens next, one short sentence.")]
    pub description: Option<String>,
    /// A monospace sketch shown while the choice is selected.
    #[schemars(
        description = "Optional plain-text sketch shown in a monospace box while this choice is selected: an ASCII layout, a code snippet, a small table. Use it when options are easier to compare visually."
    )]
    pub preview: Option<String>,
}

impl<'de> Deserialize<'de> for AskUserOption {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Full {
            label: String,
            #[serde(default)]
            description: Option<String>,
            #[serde(default)]
            preview: Option<String>,
        }
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Input {
            Label(String),
            Full(Full),
        }
        Ok(match Input::deserialize(deserializer)? {
            Input::Label(label) => Self {
                label,
                description: None,
                preview: None,
            },
            Input::Full(full) => Self {
                label: full.label,
                description: full.description,
                preview: full.preview,
            },
        })
    }
}

/// Result returned to the model after the user resolves the question.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum AskUserResponse {
    /// The user supplied an answer.
    Answered {
        /// The chosen option labels, in the order offered. Empty when the
        /// user typed their own answer or the question was free text.
        selected: Vec<String>,
        /// What the user typed: the answer to a free-text question, or their
        /// own answer instead of the options.
        #[serde(skip_serializing_if = "Option::is_none")]
        other: Option<String>,
    },
    /// The user explicitly declined to answer.
    Declined,
    /// The user dismissed the question or stopped the turn.
    Cancelled,
}

impl ToolAnnotated for AskUser {
    const ANNOTATIONS: ToolAnnotations =
        ToolAnnotations::read_only("Ask user").without_idempotent();
}

fn invalid(description: impl Into<String>) -> ToolCallError {
    let description = description.into();
    ToolCallError {
        internal_error: anyhow::anyhow!("invalid AskUser call: {description}"),
        description,
    }
}

/// Trimmed text, `None` when blank, an error past `max` characters.
fn bounded(value: Option<&str>, what: &str, max: usize) -> Result<Option<String>, ToolCallError> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    if value.chars().count() > max {
        return Err(invalid(format!(
            "AskUser {what} must be at most {max} characters."
        )));
    }
    Ok(Some(value.to_owned()))
}

impl AskUser {
    /// The question as the port asks it: trimmed, bounded, deduplicated.
    fn request(&self) -> Result<UserInputRequest, ToolCallError> {
        let question = self.question.trim();
        if question.is_empty() {
            return Err(invalid("AskUser requires a non-empty question."));
        }
        let header = self
            .header
            .as_deref()
            .map(str::trim)
            .filter(|header| !header.is_empty())
            .map(|header| header.chars().take(MAX_HEADER_CHARS).collect::<String>());

        let mut options: Vec<UserInputOption> = Vec::with_capacity(self.options.len());
        for option in &self.options {
            let Some(label) = bounded(Some(&option.label), "option labels", MAX_LABEL_CHARS)?
            else {
                continue;
            };
            if options.iter().any(|existing| existing.label == label) {
                continue;
            }
            options.push(UserInputOption {
                label,
                description: bounded(
                    option.description.as_deref(),
                    "option descriptions",
                    MAX_DESCRIPTION_CHARS,
                )?,
                preview: bounded(
                    option.preview.as_deref(),
                    "option previews",
                    MAX_PREVIEW_CHARS,
                )?,
            });
        }
        if !options.is_empty() && !(MIN_OPTIONS..=MAX_OPTIONS).contains(&options.len()) {
            return Err(invalid(format!(
                "AskUser offers {MIN_OPTIONS}-{MAX_OPTIONS} distinct options, or none for a free-text question; got {}.",
                options.len()
            )));
        }
        if self.multi_select && options.is_empty() {
            return Err(invalid("AskUser multiSelect needs options to choose from."));
        }
        let choice = !options.is_empty();
        Ok(UserInputRequest {
            question: question.to_owned(),
            header,
            multi_select: self.multi_select,
            // A free-text question is all "Other" already.
            allow_other: choice && self.allow_other,
            options,
        })
    }
}

#[async_trait]
impl AsyncTool<AskUserContext> for AskUser {
    type Output = AskUserResponse;

    #[tracing::instrument(skip_all, err)]
    async fn call(
        &self,
        service_context: ServiceContext<AskUserContext>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        let requester = service_context
            .requester
            .as_ref()
            .ok_or_else(|| ToolCallError {
                description: "This client cannot show an interactive question.".to_owned(),
                internal_error: anyhow::anyhow!("form elicitation was not advertised"),
            })?;
        let request = self.request()?;

        let answer = select! {
            biased;
            _ = request_context.cancel.cancelled() => {
                return Ok(AskUserResponse::Cancelled);
            }
            answer = requester.ask(request) => answer,
        }
        .map_err(|error| ToolCallError {
            description: error.to_string(),
            internal_error: anyhow::Error::new(error),
        })?;

        Ok(match answer {
            UserInputOutcome::Answered(answer) => AskUserResponse::Answered {
                selected: answer.selected,
                other: answer.other,
            },
            UserInputOutcome::Declined => AskUserResponse::Declined,
            UserInputOutcome::Cancelled => AskUserResponse::Cancelled,
        })
    }
}

#[cfg(test)]
mod test;
