#![deny(missing_docs)]

//! This crate creates a standard way to make AWS configs.

pub use aws_config::SdkConfig;
use macro_env_var::maybe_env_var;

maybe_env_var! {
    #[derive(Clone)]
    pub struct LocalAwsUrl;
}

maybe_env_var! {
    /// Browser-facing LocalStack endpoint, including any reverse-proxy path prefix.
    #[derive(Clone)]
    pub struct LocalAwsPublicUrl;
}

macro_env_var::maybe_env_vars! {
    /// An S3-compatible endpoint (Cloudflare R2) for object storage only;
    /// SQS, DynamoDB and KMS stay where `LOCAL_AWS_URL` points.
    #[derive(Clone)]
    pub struct S3Endpoint;
    /// Access key id for [`S3Endpoint`].
    pub struct S3AccessKeyId;
    /// Secret access key for [`S3Endpoint`].
    pub struct S3SecretAccessKey;
    /// Region for [`S3Endpoint`]; `auto` for R2 when unset.
    pub struct S3Region;
}

/// The external S3 endpoint object storage uses, when one is configured.
pub fn s3_endpoint() -> Option<String> {
    S3Endpoint::new()
        .and_then(|endpoint| endpoint.value().map(str::to_owned))
        .filter(|endpoint| !endpoint.trim().is_empty())
}

/// Whether object storage is LocalStack: local AWS without an external S3
/// endpoint. Local-only shortcuts that exist because LocalStack is a stand-in
/// (unsigned object URLs, skipped copies) apply only then.
pub fn s3_is_local() -> bool {
    is_local_aws() && s3_endpoint().is_none()
}

/// Creates an S3 client: the external [`S3Endpoint`] with its own
/// credentials when configured, otherwise the shared AWS config.
#[cfg(feature = "s3")]
pub async fn s3_client() -> aws_sdk_s3::Client {
    if let Some(endpoint) = s3_endpoint() {
        let value = |var: Option<String>| var.unwrap_or_default();
        let credentials = aws_sdk_s3::config::Credentials::new(
            value(S3AccessKeyId::new().and_then(|v| v.value().map(str::to_owned))),
            value(S3SecretAccessKey::new().and_then(|v| v.value().map(str::to_owned))),
            None,
            None,
            "s3-endpoint",
        );
        let region = S3Region::new()
            .and_then(|v| v.value().map(str::to_owned))
            .filter(|region| !region.trim().is_empty())
            .unwrap_or_else(|| "auto".to_owned());
        let s3_config = aws_sdk_s3::config::Builder::new()
            .behavior_version(aws_sdk_s3::config::BehaviorVersion::latest())
            .endpoint_url(endpoint)
            .region(aws_sdk_s3::config::Region::new(region))
            .credentials_provider(credentials)
            .force_path_style(true)
            .build();
        return aws_sdk_s3::Client::from_conf(s3_config);
    }
    let s3_config = aws_sdk_s3::config::Builder::from(&get_macro_aws_config().await)
        .force_path_style(is_local_aws())
        .build();
    aws_sdk_s3::Client::from_conf(s3_config)
}

/// A presigned GET URL for `key` in `bucket`, valid for `expires_in`, in the
/// form a browser can open.
#[cfg(feature = "s3")]
pub async fn presigned_get_url(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    key: &str,
    expires_in: std::time::Duration,
) -> anyhow::Result<String> {
    let presigned = client
        .get_object()
        .bucket(bucket)
        .key(key)
        .presigned(aws_sdk_s3::presigning::PresigningConfig::expires_in(
            expires_in,
        )?)
        .await?;
    Ok(transform_aws_url(presigned.uri()))
}

/// Creates an SQS client
#[cfg(feature = "sqs")]
pub async fn sqs_client() -> aws_sdk_sqs::Client {
    aws_sdk_sqs::Client::new(&get_macro_aws_config().await)
}

/// Creates a aws_config to use.
/// If you provide `LOCAL_AWS_URL` environment variable we create a local aws
/// config with test credentials.
/// Otherwise we load normally.
pub async fn get_macro_aws_config() -> aws_config::SdkConfig {
    if let Some(local_aws_url) = LocalAwsUrl::new() {
        local_aws_config(local_aws_url.as_ref()).await
    } else {
        aws_config::defaults(aws_config::BehaviorVersion::latest())
            .region("us-east-1")
            .load()
            .await
    }
}

/// Creates an AWS SDK config pointed at a LocalStack endpoint.
pub async fn local_aws_config(local_aws_url: &str) -> aws_config::SdkConfig {
    aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region("us-east-1")
        .test_credentials()
        .endpoint_url(local_aws_url)
        .load()
        .await
}

/// Returns if the aws config is local or not
pub fn is_local_aws() -> bool {
    LocalAwsUrl::new().is_some()
}

/// internal method to transform the local aws url
fn transform_local_url(url: &str, public_url: Option<&str>) -> String {
    // NOTE: it is ok to use expect as this is only run locally
    let parsed = url::Url::parse(url).expect("valid url");
    let host = parsed.host_str().unwrap();
    let port = parsed.port().unwrap_or(4566);
    let path = parsed.path();
    let query = parsed.query().map(|q| format!("?{q}")).unwrap_or_default();

    let origin = public_url
        .map(|url| url.trim_end_matches('/').to_owned())
        .unwrap_or_else(|| format!("http://localhost:{port}"));

    // Path-style LocalStack URLs generated inside Docker use `localstack` as
    // the host, which the browser on the host machine cannot resolve. Keep the
    // existing path (`/{bucket}/{key}`) and use the browser-facing origin.
    if host == "localstack" || host == "localhost" {
        return format!("{origin}{path}{query}");
    }

    // hostname should be in the form {asset}.localstack or {asset}.localhost
    let asset = host
        .strip_suffix(".localstack")
        .or_else(|| host.strip_suffix(".localhost"))
        .unwrap();

    format!("{origin}/{asset}{path}{query}")
}

/// Transforms a localstack url into one that will work within the app
/// For example, presigned urls for localstack come out as `http://{BUCKET_NAME}.localstack:{PORT}`
/// but we need them to be formulated as `http://localhost:{PORT}/bucket-name`.
/// `LOCAL_AWS_PUBLIC_URL`, when set by the local stack, supplies the browser-facing
/// endpoint so named instances can use their HTTPS storage proxy.
pub fn transform_aws_url(url: &str) -> String {
    // An external S3 endpoint's URLs are already browser-reachable.
    if s3_is_local() {
        let public_url = LocalAwsPublicUrl::new();
        return transform_local_url(url, public_url.as_ref().map(|url| url.as_ref()));
    }
    url.to_string()
}

/// internal method to transform a browser-facing local url into one reachable
/// from inside the docker network
fn transform_internal_url(url: &str, local_aws_url: &str, public_url: Option<&str>) -> String {
    // NOTE: it is ok to use expect as this is only run locally
    let parsed = url::Url::parse(url).expect("valid url");
    let host = parsed.host_str().unwrap();
    let path = parsed.path();
    let query = parsed.query().map(|q| format!("?{q}")).unwrap_or_default();

    // The HTTPS app proxy exposes storage below a path prefix. Match only
    // that configured endpoint and remove its prefix before calling S3.
    if let Some(public) = public_url.and_then(|url| url::Url::parse(url).ok())
        && parsed.origin() == public.origin()
        && let Some(key) = path.strip_prefix(&format!("{}/", public.path().trim_end_matches('/')))
    {
        return format!("{}/{key}{query}", local_aws_url.trim_end_matches('/'));
    }

    // Browser-facing local URLs use `localhost`, which inside a container
    // resolves to the container itself. Use the SDK endpoint, including its
    // internal port, so service-to-service fetches reach LocalStack. Leave any other
    // host untouched.
    if host == "localhost" || host == "localstack" {
        return format!("{}{path}{query}", local_aws_url.trim_end_matches('/'));
    }

    url.to_string()
}

/// Transforms a browser-facing local URL into one reachable from inside the
/// app's own containers when fetching an object server-side.
///
/// The inverse of [`transform_aws_url`]: remove the configured public endpoint's
/// origin and proxy prefix so container clients reach LocalStack directly.
/// Legacy localhost URLs are also supported. No-op outside local AWS.
pub fn transform_aws_url_for_internal_fetch(url: &str) -> String {
    if let Some(local_aws_url) = LocalAwsUrl::new() {
        let public_url = LocalAwsPublicUrl::new();
        return transform_internal_url(
            url,
            local_aws_url.as_ref(),
            public_url.as_ref().map(|url| url.as_ref()),
        );
    }
    url.to_string()
}

#[cfg(test)]
mod test;
