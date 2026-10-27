use super::*;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};

#[test]
fn stack_frontend_uses_same_origin_with_an_instance_specific_server_target() {
    for instance in [
        Instance::derive(None, None).unwrap(),
        Instance::derive(Some("remote-dev"), Some(20100)).unwrap(),
        Instance::derive(Some("other-dev"), Some(20300)).unwrap(),
    ] {
        for mode in [Mode::Local, Mode::Dev] {
            let env: std::collections::HashMap<_, _> = dev_env(&instance, mode, true)
                .unwrap()
                .into_iter()
                .collect();
            assert_eq!(
                env["MACRO_LOCAL_HOSTNAME"],
                super::super::tls::hostname().unwrap()
            );
            assert_eq!(env["VITE_LOCAL_BACKEND_ORIGIN"], "same-origin");
            assert_eq!(
                env["NODE_EXTRA_CA_CERTS"],
                proxy::ca_pem().display().to_string()
            );
            assert_eq!(env["MACRO_LOCAL_BACKEND_PROXY"], proxy::url(&instance));
            assert_eq!(
                env["MACRO_LOCAL_BACKEND_ROUTES"],
                proxy::frontend_path_prefixes().join(",")
            );
            assert_eq!(env["VITE_OTEL_EXPORTER_URL"], "/i/otlp/v1/traces");
            if mode.spec().runs_local_infra {
                assert_eq!(env["VITE_AI_EDITING_WORKER_URL"], "/ai-editing");
            } else {
                assert!(!env.contains_key("VITE_AI_EDITING_WORKER_URL"));
            }
        }
        let env: std::collections::HashMap<_, _> = dev_env(&instance, Mode::Local, false)
            .unwrap()
            .into_iter()
            .collect();
        assert_eq!(env["VITE_ENABLE_BROWSER_OTEL"], "false");
        assert!(!env.contains_key("VITE_OTEL_EXPORTER_URL"));
    }
}

fn test_frontend(stage: &Stage) -> Frontend {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);

    let mut command = Command::new("python3");
    command
        .args([
            "-u",
            "-c",
            include_str!("test_server.py"),
            &port.to_string(),
        ])
        .current_dir(app_dir())
        .env("VITE_LOCAL_BACKEND_ORIGIN", "http://localhost:18090")
        .process_group(0)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let process = spawn(stage, &mut command, port).unwrap();
    Frontend {
        process,
        command,
        port,
    }
}

fn response(frontend: &Frontend) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", frontend.port)).unwrap();
    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(5)))
        .unwrap();
    stream
        .write_all(b"GET / HTTP/1.0\r\nHost: localhost\r\n\r\n")
        .unwrap();
    let mut body = String::new();
    stream.read_to_string(&mut body).unwrap();
    body
}

#[test]
fn restart_replaces_process_and_preserves_port_environment_and_directory() {
    let stage = Stage::from_env().quiet();
    let mut frontend = test_frontend(&stage);
    // Represents an unrelated backend listener that restarting Vite must not touch.
    let backend = TcpListener::bind("127.0.0.1:0").unwrap();
    let original_port = frontend.port;

    for _ in 0..2 {
        let original_pid = frontend.process.child.id();
        frontend.restart(&stage).unwrap();

        assert_ne!(frontend.process.child.id(), original_pid);
        // SAFETY: signal 0 only probes whether the old process still exists.
        assert_eq!(unsafe { libc::kill(original_pid as i32, 0) }, -1);
        assert_eq!(frontend.port, original_port);
        let body = response(&frontend);
        assert!(body.contains("http://localhost:18090"));
        assert!(body.contains(&app_dir().display().to_string()));
        assert!(TcpStream::connect(backend.local_addr().unwrap()).is_ok());
    }

    frontend.shutdown();
    assert!(TcpStream::connect(("127.0.0.1", original_port)).is_err());
}

#[test]
fn failed_restart_reports_output_and_releases_the_port() {
    let stage = Stage::from_env().quiet();
    let mut frontend = test_frontend(&stage);
    frontend.command = Command::new("sh");
    frontend
        .command
        .args(["-c", "echo vite-startup-failed >&2; exit 1"])
        .process_group(0)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let error = frontend.restart(&stage).unwrap_err();
    assert!(error.to_string().contains("vite-startup-failed"));
    assert!(TcpStream::connect(("127.0.0.1", frontend.port)).is_err());
}

#[test]
fn the_frontend_build_follows_github_and_a_prebuilt_bundle() {
    let env = |pairs: &[(&str, &str)]| {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect::<BTreeMap<_, _>>()
    };
    assert_eq!(
        FrontendBuild::from_env(&env(&[])),
        FrontendBuild {
            github_login: false,
            prebuilt: None
        }
    );
    assert!(
        !FrontendBuild::from_env(&env(&[
            ("GITHUB_CLIENT_ID", "local-github-client"),
            ("GITHUB_CLIENT_SECRET", "local-github-client-secret"),
        ]))
        .github_login
    );
    let build = FrontendBuild::from_env(&env(&[
        ("GITHUB_CLIENT_ID", "Iv1.realclient"),
        ("GITHUB_CLIENT_SECRET", "real-secret"),
        ("MACRO_FRONTEND_BUNDLE", "/srv/macro/frontend"),
    ]));
    assert!(build.github_login);
    assert_eq!(build.prebuilt, Some(PathBuf::from("/srv/macro/frontend")));
    assert!(bundle_env(Mode::Local, true).contains(&("VITE_ENABLE_GITHUB_LOGIN", "true")));
    assert!(
        bundle_env(Mode::Local, false)
            .iter()
            .all(|(k, _)| *k != "VITE_ENABLE_GITHUB_LOGIN")
    );
}

#[test]
fn a_prebuilt_bundle_without_index_html_is_refused() {
    let instance = Instance::derive(Some("prebuilt-bundle-test"), None).unwrap();
    let empty = std::env::temp_dir().join("macro-prebuilt-bundle-test");
    std::fs::create_dir_all(&empty).unwrap();
    let build = FrontendBuild {
        github_login: false,
        prebuilt: Some(empty.clone()),
    };
    let error = build_static(&Stage::from_env(), &instance, Mode::Local, &build)
        .unwrap_err()
        .to_string();
    assert!(error.contains("index.html"), "{error}");
    let _ = std::fs::remove_dir_all(&empty);
    let _ = std::fs::remove_dir_all(instance.artifact_dir());
}
