//! SMTP delivery. Local mode sends to a plaintext SMTP sink (Mailpit) so email
//! flows are inspectable without SES or real credentials; a self-hosted
//! instance sends through a real server with TLS and a login.

use std::fmt;

use anyhow::{Context, Result, bail};
use lettre::message::Mailbox;
use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Address, AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

#[cfg(test)]
mod test;

/// Port Mailpit listens on, used when `SMTP_PORT` is unset.
const DEFAULT_PORT: u16 = 1025;

/// How the connection to the SMTP server is secured, named as FusionAuth
/// names its email security setting.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum SmtpSecurity {
    /// Plaintext, no TLS (Mailpit).
    None,
    /// Implicit TLS from the first byte (`SSL`, usually port 465).
    Ssl,
    /// Plaintext upgraded with STARTTLS (`TLS`, usually port 587).
    StartTls,
}

/// Where and how to deliver over SMTP.
#[derive(Clone, PartialEq, Eq)]
pub(crate) struct SmtpConfig {
    host: String,
    port: u16,
    security: SmtpSecurity,
    credentials: Option<Credentials>,
    /// Replaces every sender address, for servers that only relay mail from
    /// their own domain.
    from: Option<Mailbox>,
}

impl SmtpConfig {
    /// Build from the raw `SMTP_*` values. Only `host` is required; the rest
    /// default to Mailpit's plaintext, unauthenticated listener.
    pub(crate) fn from_values(
        host: &str,
        port: Option<&str>,
        security: Option<&str>,
        username: Option<&str>,
        password: Option<&str>,
        from: Option<&str>,
    ) -> Result<Self> {
        let port = match nonblank(port) {
            Some(port) => port.parse().context("SMTP_PORT must be a port number")?,
            None => DEFAULT_PORT,
        };
        let security = match nonblank(security).map(str::to_ascii_uppercase).as_deref() {
            None | Some("NONE") => SmtpSecurity::None,
            Some("SSL") => SmtpSecurity::Ssl,
            Some("TLS") => SmtpSecurity::StartTls,
            Some(_) => bail!("SMTP_SECURITY must be NONE, SSL or TLS"),
        };
        let credentials = match (nonblank(username), password.filter(|p| !p.is_empty())) {
            (Some(username), Some(password)) => {
                Some(Credentials::new(username.to_owned(), password.to_owned()))
            }
            (None, None) => None,
            _ => bail!("SMTP_USERNAME and SMTP_PASSWORD must be set together"),
        };
        let from = nonblank(from)
            .map(|from| from.parse::<Mailbox>())
            .transpose()
            .context("SMTP_FROM must be an address or `Name <address>`")?;
        Ok(Self {
            host: host.to_owned(),
            port,
            security,
            credentials,
            from,
        })
    }

    fn transport(&self) -> Result<AsyncSmtpTransport<Tokio1Executor>> {
        type Transport = AsyncSmtpTransport<Tokio1Executor>;
        let builder = match self.security {
            SmtpSecurity::None => Transport::builder_dangerous(&self.host),
            SmtpSecurity::Ssl => Transport::relay(&self.host).context("configuring SMTP TLS")?,
            SmtpSecurity::StartTls => {
                Transport::starttls_relay(&self.host).context("configuring SMTP STARTTLS")?
            }
        }
        .port(self.port);
        Ok(match &self.credentials {
            Some(credentials) => builder.credentials(credentials.clone()).build(),
            None => builder.build(),
        })
    }
}

// Hand-written so the password never reaches a log.
impl fmt::Debug for SmtpConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SmtpConfig")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("security", &self.security)
            .field("authenticated", &self.credentials.is_some())
            .field("from", &self.from)
            .finish()
    }
}

/// Send an HTML email over SMTP.
pub(crate) async fn send_email_smtp(
    config: &SmtpConfig,
    from_email: &str,
    to_email: &str,
    subject: &str,
    content: &str,
) -> Result<()> {
    let from = match &config.from {
        Some(from) => from.clone(),
        None => mailbox(from_email).context("parsing from address")?,
    };
    let to = mailbox(to_email).context("parsing to address")?;

    let email = Message::builder()
        .from(from)
        .to(to)
        .subject(subject)
        .header(ContentType::TEXT_HTML)
        .body(content.to_string())
        .context("building SMTP message")?;

    config
        .transport()?
        .send(email)
        .await
        .context("sending via SMTP")?;
    Ok(())
}

fn nonblank(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn mailbox(email: &str) -> Result<Mailbox> {
    let address: Address = email
        .parse()
        .with_context(|| format!("invalid email '{email}'"))?;
    Ok(Mailbox::new(None, address))
}
