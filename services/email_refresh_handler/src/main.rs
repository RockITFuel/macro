#![recursion_limit = "256"]

mod config;
mod context;
mod handler;
#[cfg(test)]
mod test;

use anyhow::Context;
use aws_lambda_events::event::eventbridge::EventBridgeEvent;
use config::Config;
use handler::{handler, refresh};
use lambda_runtime::{Error, LambdaEvent, run, service_fn};
use macro_entrypoint::MacroEntrypoint;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Error> {
    MacroEntrypoint::default().init();

    let config = Config::from_env().context("all necessary env vars should be available")?;

    // should only need a single connection to fetch the list of emails
    let db = PgPoolOptions::new()
        .min_connections(1)
        .max_connections(1)
        .connect(&config.database_url)
        .await
        .context("could not connect to db")?;

    let link_manager_queue = macro_queues::LinkManagerQueue::new();
    let sqs_client = sqs_client::SQS::new(aws_sdk_sqs::Client::new(
        &macro_aws_config::get_macro_aws_config().await,
    ))
    .email_link_manager_queue(&link_manager_queue);

    let ctx = context::Context {
        db,
        sqs_client: Arc::new(sqs_client),
        config,
    };

    // Outside AWS (the self-hosted stack's `email_refresher` sidecar) there is no
    // EventBridge schedule: run the same pass at the top of every hour.
    if std::env::args().any(|arg| arg == "--every-hour") {
        loop {
            if let Err(error) = refresh(&ctx).await {
                tracing::error!(error = ?error, "email refresh pass failed");
            }
            tokio::time::sleep(until_next_hour(chrono::Utc::now())).await;
        }
    }

    let func = service_fn(move |event: LambdaEvent<EventBridgeEvent>| {
        let ctx = ctx.clone();

        async move { handler(ctx, event).await }
    });

    run(func).await
}

/// Time left until a minute past the next full hour. The handler buckets links
/// by hour of day, so each pass must land inside a distinct hour.
fn until_next_hour(now: chrono::DateTime<chrono::Utc>) -> std::time::Duration {
    let into_hour = now.timestamp().rem_euclid(3600) as u64;
    std::time::Duration::from_secs(3600 - into_hour + 60)
}
