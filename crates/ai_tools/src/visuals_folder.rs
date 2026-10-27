//! The project service as `RenderHtml`'s folder store, and the context the
//! tool runs with: the document tools plus the user's "Visuals" folder.

use std::sync::Arc;

use async_trait::async_trait;
use axum::extract::FromRef;
use documents::inbound::toolset::render_html::RenderHtmlContext;
use documents::inbound::toolset::render_html::visuals_folder::{
    FolderStore, FolderSummary, VisualsFolders,
};
use model::project::request::CreateProjectRequest;
use model_owner::CreationPrincipal;
use projects::domain::ports::ProjectService;
use uuid::Uuid;

use crate::tool_context::{
    ToolDocumentService, ToolDocumentToolContext, ToolEntityAccessService, ToolProjectService,
    ToolServiceContext,
};

/// The context `RenderHtml` runs with in every host that offers it.
pub type ToolRenderHtmlContext = RenderHtmlContext<
    ToolDocumentService,
    ToolEntityAccessService,
    documents::outbound::editing_worker_client::ReqwestEditingWorkerClient,
>;

/// Projects as folders, through the same service as the project tools.
pub struct ProjectFolderStore(pub Arc<ToolProjectService>);

#[async_trait]
impl FolderStore for ProjectFolderStore {
    async fn folders(&self, principal: &CreationPrincipal) -> anyhow::Result<Vec<FolderSummary>> {
        let Some(user) = principal.user() else {
            return Ok(Vec::new());
        };
        let projects = self.0.list_accessible_projects(user.clone()).await?;
        Ok(projects
            .into_iter()
            .filter_map(|project| {
                Some(FolderSummary {
                    id: project.id.parse().ok()?,
                    name: project.name,
                    owner: project.user_id,
                    nested: project.parent_id.is_some(),
                    deleted: project.deleted_at.is_some(),
                })
            })
            .collect())
    }

    async fn create_folder(
        &self,
        principal: &CreationPrincipal,
        name: &str,
    ) -> anyhow::Result<Uuid> {
        let project = self
            .0
            .create_project(
                principal,
                CreateProjectRequest {
                    name: name.to_owned(),
                    project_parent_id: None,
                },
            )
            .await?;
        Ok(project.id.parse()?)
    }
}

impl FromRef<ToolServiceContext> for ToolRenderHtmlContext {
    fn from_ref(context: &ToolServiceContext) -> Self {
        RenderHtmlContext {
            documents: ToolDocumentToolContext::from_ref(context),
            folders: Arc::new(VisualsFolders::new(ProjectFolderStore(Arc::clone(
                &context.project_tool_context.service,
            )))),
        }
    }
}
