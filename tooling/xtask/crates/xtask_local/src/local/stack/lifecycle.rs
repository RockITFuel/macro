//! Keeping an instance's data: the guard that stops `up` wiping a public
//! stack, `stack start` (bring an existing instance back without wiping),
//! and `stack backup` (dump its databases).

use std::os::unix::fs::OpenOptionsExt;
use std::path::PathBuf;
use std::process::Command;

use anyhow::{Context, Result, bail};
use clap::Args;

use super::super::cli::{EnvArgs, InstanceArgs, RunArgs};
use super::super::frontend;
use super::super::instance::Instance;
use super::super::local_env::Tunnels;
use super::super::stage::Stage;
use super::{StackState, mode_from_label, read_state, recorded_instance, write_state};

/// Refuse a bring-up that would wipe `existing` data volumes, unless the
/// caller asked for a fresh instance.
pub(super) fn refuse_wipe(instance: &Instance, existing: &[String], fresh: bool) -> Result<()> {
    if fresh || existing.is_empty() {
        return Ok(());
    }
    bail!(
        "instance {name} already has data ({volumes}); `stack up` would wipe it. \
         Use `stack start` to bring it back, `stack update` to adopt a new build, \
         or pass --fresh to start over",
        name = instance.name(),
        volumes = existing.join(", "),
    )
}

#[derive(Args, Clone, Default)]
pub struct StartArgs {
    #[command(flatten)]
    pub instance: InstanceArgs,
    #[command(flatten)]
    pub env: EnvArgs,
    /// Serve this prebuilt binary set instead of the one recorded at `up`.
    #[arg(long)]
    pub binaries_dir: Option<PathBuf>,
    /// Stream subprocess output and show per-step timings.
    #[arg(long, short)]
    pub verbose: bool,
}

/// `cargo x stack start`: bring an existing instance back (after a reboot or
/// `stack down --keep-data`) without touching its volumes. Regenerates the
/// compose files, re-provisions LocalStack (its state is not persisted),
/// runs pending migrations and the other idempotent init steps, then starts
/// the app.
pub fn start(args: &StartArgs) -> Result<()> {
    let stage = Stage::from_env_cli(args.verbose);
    let instance = recorded_instance(&args.instance)?;
    let state = read_state(&instance).with_context(|| {
        format!(
            "instance {} has no recorded stack; bring it up with `stack up` first",
            instance.name()
        )
    })?;
    if super::super::existing_data_volumes(&instance)?.is_empty() {
        bail!(
            "instance {} has no data volumes; nothing to start (use `stack up`)",
            instance.name()
        );
    }
    let mode = mode_from_label(&state.mode)?;
    stage.section(&format!(
        "macro {} stack start — instance {}",
        mode.label(),
        instance.name()
    ));
    let binaries_dir = args.binaries_dir.clone().or(state.binaries_dir.clone());
    let static_frontend = state.frontend == "static";
    let run = RunArgs {
        instance: args.instance.clone(),
        env: args.env.clone(),
        build: super::super::cli::BuildArgs {
            no_build: binaries_dir.is_some(),
            build_aux_services: false,
            binaries_dir: binaries_dir.clone(),
        },
        no_frontend: !static_frontend,
        verbose: args.verbose,
        no_snapshot: true,
        traces: super::super::cli::TracesBackend::default(),
        with_chrome: false,
        with_cf_tunnel: false,
    };
    let (env, _target) = super::super::prepare(
        &stage,
        mode,
        &instance,
        &run,
        static_frontend,
        false,
        false,
        Tunnels::default(),
    )?;
    super::super::ensure_external_resources(&stage, &instance)?;
    // The full init is idempotent against existing volumes: migrations,
    // topics and indices skip what exists, and FusionAuth ignores its
    // kickstart once its database is set up.
    super::super::bring_up_infra(&stage, mode, &instance, &env, super::super::InfraInit::Full)?;
    if static_frontend && !frontend::static_dir(&instance).join("index.html").exists() {
        frontend::build_static(
            &stage,
            &instance,
            mode,
            &frontend::FrontendBuild::from_env(&env.merged),
        )?;
    }
    super::super::bring_up_app(&stage, mode, &instance, &env)?;
    if mode.spec().wait_backend_before_frontend {
        frontend::wait_backend_ready(&stage, &instance)?;
    }
    if !stage.is_dry_run() {
        write_state(
            &instance,
            &StackState {
                mode: state.mode,
                frontend: state.frontend,
                binaries_dir,
                port_base: Some(instance.port_base()),
            },
        )?;
    }
    stage.note(&format!("instance {} started; data kept", instance.name()));
    Ok(())
}

#[derive(Args, Clone, Default)]
pub struct BackupArgs {
    #[command(flatten)]
    pub instance: InstanceArgs,
    /// Directory the dumps are written to (created when missing).
    #[arg(long)]
    pub out: PathBuf,
}

/// The databases `stack backup` dumps: (compose service, role, database, file
/// stem). The rest of an instance's state is either derived (OpenSearch
/// indices, Kafka topics) or ephemeral.
const BACKUPS: [(&str, &str, &str, &str); 2] = [
    ("postgres", "user", "macrodb", "macrodb"),
    ("db", "postgres", "fusionauth", "fusionauth"),
];

/// `cargo x stack backup`: dump the Macro and FusionAuth databases of a
/// running instance to `<out>/<database>-<unix time>.dump` (pg_dump custom
/// format; restore with `pg_restore --clean --if-exists -d <db>`).
pub fn backup(args: &BackupArgs) -> Result<()> {
    let instance = recorded_instance(&args.instance)?;
    std::fs::create_dir_all(&args.out)
        .with_context(|| format!("creating {}", args.out.display()))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .context("system clock before 1970")?
        .as_secs();
    for (service, role, database, stem) in BACKUPS {
        let path = args.out.join(format!("{stem}-{stamp}.dump"));
        // Owner-only: the dumps hold every account and secret of the instance.
        let file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&path)
            .with_context(|| format!("creating {}", path.display()))?;
        let status = Command::new("docker")
            .args(dump_args(&instance, service, role, database))
            .stdout(file)
            .status()
            .context("running docker exec pg_dump")?;
        if !status.success() {
            let _ = std::fs::remove_file(&path);
            bail!("pg_dump of {database} exited with {status}");
        }
        println!("{}", path.display());
    }
    Ok(())
}

/// `docker exec` arguments dumping `database` from the instance's `service`
/// container. The images trust local socket connections, so no password.
fn dump_args(instance: &Instance, service: &str, role: &str, database: &str) -> Vec<String> {
    vec![
        "exec".into(),
        format!("{}-{service}-1", instance.project_name()),
        "pg_dump".into(),
        "-U".into(),
        role.into(),
        "-Fc".into(),
        database.into(),
    ]
}

#[cfg(test)]
mod test;
