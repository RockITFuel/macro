//! Handlers for `GET` and `PUT /documents/{document_id}/markdown`: exact
//! markdown reads and writes of a native markdown document.

use axum::{Extension, Json, extract::State};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use entity_access::domain::ports::EntityAccessService;
use entity_access::inbound::axum_extractors::DocumentAccessExtractor;
use entity_registry::CreationPrincipalExtractor;
use macro_authorization::MacroAuthorizationService;
use model::document::DocumentBasic;
use models_permissions::share_permission::access_level::{
    AccessLevel, EditAccessLevel, ViewAccessLevel,
};

use super::DocumentRouterState;
use crate::domain::markdown_replace::{ensure_markdown, read_markdown, write_markdown};
use crate::domain::models::DocumentError;
use crate::domain::permission_token::encode_principal_permission_token;
use crate::domain::ports::DocumentService;

/// A document's markdown and the version it was read at.
#[derive(serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMarkdownResponse {
    /// The document's content as markdown, without a trailing newline.
    pub markdown: String,
    /// Opaque version of the content; pass it as `baseVersionId` to write
    /// only if nobody edited the document since.
    pub version_id: String,
}

/// Replace a document's content with exactly this markdown.
#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetDocumentMarkdownRequest {
    /// The new content.
    pub markdown: String,
    /// Write only if the document is still at this version (409 otherwise).
    #[serde(default)]
    pub base_version_id: Option<String>,
}

/// The result of a markdown write.
#[derive(serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetDocumentMarkdownResponse {
    /// The version after the write.
    pub version_id: String,
    /// False when the document already held this markdown and nothing changed.
    pub changed: bool,
}

/// Read a native markdown document's markdown with its version.
#[utoipa::path(
    get,
    tag = "document",
    path = "/documents/{document_id}/markdown",
    operation_id = "get_document_markdown",
    params(("document_id" = String, Path, description = "Document ID")),
    responses(
        (status = 200, body = DocumentMarkdownResponse),
        (status = 400, body = model_error_response::ErrorResponse),
        (status = 401, body = model_error_response::ErrorResponse),
        (status = 404, body = model_error_response::ErrorResponse),
        (status = 500, body = model_error_response::ErrorResponse),
    )
)]
#[tracing::instrument(skip_all, fields(document_id = %document.document_id), err)]
pub async fn get_document_markdown_handler<
    T: DocumentService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    _access: DocumentAccessExtractor<ViewAccessLevel, Svc, Auth>,
    CreationPrincipalExtractor { principal, .. }: CreationPrincipalExtractor<Auth>,
    State(state): State<DocumentRouterState<T, Svc, Auth>>,
    // Request-local metadata from ensure_document_exists, not a shared service.
    // ast-grep-ignore: rust-no-axum-extension-param
    Extension(document): Extension<DocumentBasic>,
) -> Result<Json<DocumentMarkdownResponse>, DocumentError> {
    ensure_markdown(&document)?;
    let token = encode_principal_permission_token(
        &principal,
        document.document_id.clone(),
        AccessLevel::View,
        &state.document_permission_jwt_secret,
    )?;
    let read = read_markdown(
        state.sync_service_client.as_ref(),
        state.lexical_client.as_ref(),
        &document.document_id,
        &token,
    )
    .await?;
    Ok(Json(DocumentMarkdownResponse {
        markdown: read.markdown,
        version_id: URL_SAFE_NO_PAD.encode(read.revision),
    }))
}

/// Replace a native markdown document's content with exactly the given
/// markdown, as a collaborative edit that open editors receive live.
#[utoipa::path(
    put,
    tag = "document",
    path = "/documents/{document_id}/markdown",
    operation_id = "set_document_markdown",
    params(("document_id" = String, Path, description = "Document ID")),
    request_body = SetDocumentMarkdownRequest,
    responses(
        (status = 200, body = SetDocumentMarkdownResponse),
        (status = 400, body = model_error_response::ErrorResponse),
        (status = 401, body = model_error_response::ErrorResponse),
        (status = 404, body = model_error_response::ErrorResponse),
        (status = 409, description = "The document changed since baseVersionId", body = model_error_response::ErrorResponse),
        (status = 500, body = model_error_response::ErrorResponse),
    )
)]
#[tracing::instrument(skip_all, fields(document_id = %document.document_id), err)]
pub async fn set_document_markdown_handler<
    T: DocumentService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    _access: DocumentAccessExtractor<EditAccessLevel, Svc, Auth>,
    CreationPrincipalExtractor { principal, .. }: CreationPrincipalExtractor<Auth>,
    State(state): State<DocumentRouterState<T, Svc, Auth>>,
    // Request-local metadata from ensure_document_exists, not a shared service.
    // ast-grep-ignore: rust-no-axum-extension-param
    Extension(document): Extension<DocumentBasic>,
    Json(request): Json<SetDocumentMarkdownRequest>,
) -> Result<Json<SetDocumentMarkdownResponse>, DocumentError> {
    if document.deleted_at.is_some() {
        return Err(DocumentError::BadRequest(
            "cannot modify deleted document".to_string(),
        ));
    }
    ensure_markdown(&document)?;
    let base_revision = request
        .base_version_id
        .map(|version| URL_SAFE_NO_PAD.decode(version))
        .transpose()
        .map_err(|_| DocumentError::BadRequest("invalid baseVersionId".to_string()))?;
    let token = encode_principal_permission_token(
        &principal,
        document.document_id.clone(),
        AccessLevel::Edit,
        &state.document_permission_jwt_secret,
    )?;
    let written = write_markdown(
        state.sync_service_client.as_ref(),
        state.lexical_client.as_ref(),
        &document.document_id,
        &token,
        &request.markdown,
        base_revision.as_deref(),
    )
    .await?;
    Ok(Json(SetDocumentMarkdownResponse {
        version_id: URL_SAFE_NO_PAD.encode(written.revision),
        changed: written.changed,
    }))
}
