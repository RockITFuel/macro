//! RenderHtml: show a self-contained HTML page inline in the conversation,
//! saved as an HTML document so it survives reloads and can be shared.

use ai_toolset::{
    AsyncTool, RequestContext, ServiceContext, ToolAnnotated, ToolAnnotations, ToolCallError,
    ToolResult,
};
use async_trait::async_trait;
use entity_access::domain::ports::EntityAccessService;
use model::document::FileType;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::DocumentToolContext;
use crate::domain::create::{NewDocumentMetadata, NewPlainTextDocument};
use crate::domain::models::DocumentError;
use crate::domain::ports::DocumentService;
use crate::domain::ports::create::DocumentCreationService;
use crate::domain::ports::editing::EditingWorkerService;

mod check;
#[cfg(test)]
mod test;

use check::page_warnings;

/// Largest page, in bytes. The page travels in the tool call and stays in the
/// transcript, so it is bounded well below what storage would take.
pub const MAX_HTML_BYTES: usize = 256 * 1024;
/// Longest title, in characters.
pub const MAX_TITLE_CHARS: usize = 120;
/// Smallest frame height, in CSS pixels.
pub const MIN_HEIGHT: u32 = 80;
/// Largest frame height, in CSS pixels.
pub const MAX_HEIGHT: u32 = 2_000;

/// Show a finished HTML page inline in the conversation.
#[derive(Debug, Deserialize, JsonSchema, Clone)]
#[serde(rename_all = "camelCase")]
#[schemars(
    title = "RenderHtml",
    description = "Show a finished, self-contained HTML page (chart, table, diagram, dashboard, mockup) inline in this conversation, above your reply, and save it as an HTML document the user can open and share. Call it before your final reply; the reply adds only what the page does not say. Read the Show Visuals skill before your first page. One document with inline <style> and <script>, run in a sandbox: no network requests, storage, forms or popups; scripts only from cdn.jsdelivr.net, unpkg.com or cdnjs.cloudflare.com; images as data: URLs or SVG. Leave html and body transparent, use fluid widths and fixed pixel heights for charts, never 100vh. Style it with Macro's theme variables on :root, which follow the user's light or dark mode: --foreground, --muted-foreground, --subtle-foreground, --card, --muted, --border, --border-muted, --accent, --accent-surface, --link, --success, --warning, --failure, --chart-1 to --chart-9 (series colors, in order), --font-sans, --font-mono, --text-xs to --text-2xl, --radius-sm, --radius, --radius-lg, --space-1 to --space-8. Plain headings, tables, code and buttons are already styled. Returns warnings for anything the sandbox or layout will break; fix them and render again. Pages up to 256 KB."
)]
pub struct RenderHtml {
    /// The page's short name.
    #[schemars(
        description = "A short name for the page, also the saved document's name (at most 120 characters)."
    )]
    pub title: String,
    /// The page.
    #[schemars(description = "A complete, self-contained HTML document.")]
    pub html: String,
    /// Frame height.
    #[schemars(
        description = "Frame height in CSS pixels, 80-2000. The frame shrinks to a shorter page; a taller page scrolls inside the frame."
    )]
    pub height: u32,
}

/// What the tool returns.
#[derive(Debug, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RenderHtmlResponse {
    /// The saved HTML document.
    pub document_id: uuid::Uuid,
    /// The frame height used, after clamping to 80-2000.
    pub height: u32,
    /// What to fix before the page renders as intended; render again after
    /// fixing. Absent when nothing stands out.
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub warnings: Vec<String>,
}

impl ToolAnnotated for RenderHtml {
    const ANNOTATIONS: ToolAnnotations = ToolAnnotations::additive("Render HTML");
}

fn invalid(description: impl Into<String>) -> ToolCallError {
    let description = description.into();
    ToolCallError {
        internal_error: anyhow::anyhow!("invalid RenderHtml call: {description}"),
        description,
    }
}

impl RenderHtml {
    /// The trimmed title, checked page and clamped height.
    fn validated(&self) -> Result<(String, u32), ToolCallError> {
        let title = self.title.trim();
        if title.is_empty() {
            return Err(invalid("RenderHtml requires a non-empty title."));
        }
        if title.chars().count() > MAX_TITLE_CHARS {
            return Err(invalid(format!(
                "RenderHtml title must be at most {MAX_TITLE_CHARS} characters."
            )));
        }
        if self.html.trim().is_empty() {
            return Err(invalid("RenderHtml requires a non-empty html document."));
        }
        if self.html.len() > MAX_HTML_BYTES {
            return Err(invalid(format!(
                "The page is {} KB; RenderHtml takes at most {} KB. Shrink inline data (images, datasets) or split it into several pages.",
                self.html.len().div_ceil(1024),
                MAX_HTML_BYTES / 1024
            )));
        }
        Ok((title.to_owned(), self.height.clamp(MIN_HEIGHT, MAX_HEIGHT)))
    }
}

#[async_trait]
impl<DSvc, ESvc, EDSvc> AsyncTool<DocumentToolContext<DSvc, ESvc, EDSvc>> for RenderHtml
where
    DSvc: DocumentService + DocumentCreationService,
    ESvc: EntityAccessService,
    EDSvc: EditingWorkerService,
{
    type Output = RenderHtmlResponse;

    #[tracing::instrument(skip_all, err)]
    async fn call(
        &self,
        service_context: ServiceContext<DocumentToolContext<DSvc, ESvc, EDSvc>>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        let (title, height) = self.validated()?;
        let failed = |error: DocumentError| ToolCallError {
            description: match &error {
                DocumentError::BadRequest(message) => message.clone(),
                DocumentError::NameTooLong { max } => {
                    format!("title too long (max {max} characters)")
                }
                _ => "failed to save the page".to_owned(),
            },
            internal_error: error.into(),
        };

        let principal = service_context.creation_principal(request_context.user_id.clone());
        let document = NewPlainTextDocument::builder(NewDocumentMetadata::builder(title).build())
            .file_type(FileType::Html)
            .text(self.html.clone())
            .task_flag(false, None)
            .build()
            .map_err(failed)?;
        let created = service_context
            .creator
            .create_plain_text(&principal, document)
            .await
            .map_err(failed)?
            .into_response();

        let document_id = created
            .document_response
            .document_metadata
            .metadata
            .document_id
            .to_string()
            .parse()
            .map_err(|error: uuid::Error| ToolCallError {
                description: "the saved page has an invalid id".to_owned(),
                internal_error: error.into(),
            })?;
        Ok(RenderHtmlResponse {
            document_id,
            height,
            warnings: page_warnings(&self.html),
        })
    }
}
