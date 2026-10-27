use std::sync::Arc;

use document_upload_finalizer_handler::{
    AppContext, inbound::local_sqs::run_local_sqs_worker, inbound::storage_poll::run_storage_poller,
};
use lambda_runtime::tracing;

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    macro_entrypoint::MacroEntrypoint::default().init();
    tracing::trace!("initiating local document upload finalizer worker");

    let context = Arc::new(AppContext::from_env().await?);
    // An external S3 endpoint (R2) sends no S3 notifications to the queue.
    if macro_aws_config::s3_endpoint().is_some() {
        run_storage_poller(context).await
    } else {
        run_local_sqs_worker(context).await
    }
}
