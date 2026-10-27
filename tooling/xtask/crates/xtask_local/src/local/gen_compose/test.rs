use super::*;

#[test]
fn generated_services_have_bounded_console_logs_in_every_mode() {
    for mode in [Mode::Local, Mode::Dev] {
        for name in [None, Some("logging-test")] {
            let instance = Instance::derive(name, None).unwrap();
            let mut services = IndexMap::new();
            for svc in services_for_mode(mode) {
                services.insert(svc.compose_name.to_string(), Some(dct::Service::default()));
            }
            add_localstack_service(&mut services, &instance);
            add_proxy_service(&mut services, &instance, false, false);
            let compose = dct::Compose {
                services: dct::Services(services),
                ..Default::default()
            };
            let mut value = serde_yaml::to_value(compose).unwrap();
            apply_tags(&mut value, mode, &instance);

            for service in value["services"].as_mapping().unwrap().values() {
                assert_eq!(service["logging"]["driver"], "json-file");
                assert_eq!(service["logging"]["options"]["max-size"], "20m");
                assert_eq!(service["logging"]["options"]["max-file"], "3");
            }
        }
    }
}

#[test]
fn fusionauth_kickstart_is_privately_relabelled_and_replaces_inherited_mounts() {
    for name in [None, Some("selinux-test")] {
        let instance = Instance::derive(name, None).unwrap();
        let mut services = IndexMap::new();
        add_local_infra(&mut services, &instance, false);
        let compose = dct::Compose {
            services: dct::Services(services),
            ..Default::default()
        };
        let mut value = serde_yaml::to_value(compose).unwrap();
        apply_tags(&mut value, Mode::Local, &instance);

        let Value::Tagged(volumes) = &value["services"]["fusionauth"]["volumes"] else {
            panic!("FusionAuth mounts must replace the inherited mount list");
        };
        assert_eq!(volumes.tag, Tag::new("!override"));
        assert_eq!(
            volumes.value,
            serde_yaml::to_value(vec![
                "fusionauth_config:/usr/local/fusionauth/config".to_string(),
                format!(
                    "{}:/usr/local/fusionauth/kickstart:ro,Z",
                    kickstart_dir(&instance).display()
                ),
            ])
            .unwrap()
        );
    }
}

#[test]
fn every_local_harness_publishes_the_api_port_used_by_the_sdk() {
    for name in [None, Some("harness-ports")] {
        let instance = Instance::derive(name, None).unwrap();
        let service = services_for_mode(Mode::Local)
            .find(|service| service.compose_name == EGRESS_SERVICE)
            .unwrap();
        let ports = published_ports(Mode::Local, &instance, service);
        assert!(ports.contains(&format!("{}:8080", instance.port(Port::AgentHarness))));
        assert!(ports.contains(&format!(
            "{}:{EGRESS_CONTAINER_PORT}",
            instance.port(Port::AgentHarnessEgress)
        )));
        assert!(ports.contains(&format!("{}:2222", instance.port(Port::PreviewSsh))));
    }
}

#[test]
fn self_host_binds_every_port_and_hands_over_the_database_passwords() {
    let instance = Instance::derive(Some("bind-test"), None).unwrap();
    let mut services = IndexMap::new();
    for svc in services_for_mode(Mode::Local) {
        services.insert(
            svc.compose_name.to_string(),
            Some(dct::Service {
                ports: dct::Ports::Short(published_ports(Mode::Local, &instance, svc)),
                ..Default::default()
            }),
        );
    }
    add_localstack_service(&mut services, &instance);
    add_proxy_service(&mut services, &instance, true, true);
    add_local_infra(&mut services, &instance, true);
    let compose = dct::Compose {
        services: dct::Services(services),
        ..Default::default()
    };
    let mut value = serde_yaml::to_value(compose).unwrap();
    apply_tags(&mut value, Mode::Local, &instance);
    let self_host = SelfHost {
        bind_address: Some("127.0.0.1".into()),
        postgres_password: Some("pg-secret".into()),
        fusionauth_db_password: Some("fa-secret".into()),
        ..SelfHost::default()
    };
    apply_self_host(&mut value, &self_host);

    let mut published = 0;
    for (name, service) in value["services"].as_mapping().unwrap() {
        let ports = match &service["ports"] {
            Value::Tagged(tagged) => tagged.value.clone(),
            ports => ports.clone(),
        };
        for port in ports.as_sequence().into_iter().flatten() {
            let port = port.as_str().unwrap();
            assert!(port.starts_with("127.0.0.1:"), "{name:?} publishes {port}");
            published += 1;
        }
    }
    assert!(published > 10, "only {published} ports checked");

    let services = &value["services"];
    assert_eq!(
        services["postgres"]["environment"]["POSTGRES_PASSWORD"],
        "${MACRO_POSTGRES_PASSWORD}"
    );
    assert_eq!(
        services["db"]["environment"]["POSTGRES_PASSWORD"],
        "${MACRO_FUSIONAUTH_DB_PASSWORD}"
    );
    assert_eq!(
        services["fusionauth"]["environment"]["DATABASE_PASSWORD"],
        "${MACRO_FUSIONAUTH_DB_PASSWORD}"
    );
}

#[test]
fn without_self_host_settings_the_override_is_unchanged() {
    let instance = Instance::derive(Some("bind-default-test"), None).unwrap();
    let mut services = IndexMap::new();
    add_local_infra(&mut services, &instance, true);
    let compose = dct::Compose {
        services: dct::Services(services),
        ..Default::default()
    };
    let mut value = serde_yaml::to_value(compose).unwrap();
    apply_tags(&mut value, Mode::Local, &instance);
    let before = value.clone();
    apply_self_host(&mut value, &SelfHost::default());
    assert_eq!(value, before);
}

#[test]
fn a_public_harness_gets_its_binaries_but_not_the_docker_socket() {
    let mounts = vec![dct::Volumes::Simple("/srv/out:/app/out:ro".to_string())];
    let compose = |self_host: &SelfHost| {
        let mut services = IndexMap::new();
        services.insert(
            EGRESS_SERVICE.to_string(),
            Some(dct::Service {
                volumes: mounts.clone(),
                ..Default::default()
            }),
        );
        let mut value = serde_yaml::to_value(dct::Compose {
            services: dct::Services(services),
            ..Default::default()
        })
        .unwrap();
        apply_self_host(&mut value, self_host);
        value["services"][EGRESS_SERVICE]["volumes"].clone()
    };

    // Local: the override's mounts merge with the base's socket mount.
    assert!(!matches!(compose(&SelfHost::default()), Value::Tagged(_)));
    let Value::Tagged(volumes) = compose(&SelfHost {
        public_origin: Some("https://macro.example.com".into()),
        ..SelfHost::default()
    }) else {
        panic!("a public harness must replace the inherited mounts");
    };
    assert_eq!(volumes.tag, Tag::new("!override"));
    assert_eq!(
        volumes.value,
        serde_yaml::to_value(vec!["/srv/out:/app/out:ro"]).unwrap()
    );
}

#[test]
fn a_public_stack_restarts_every_service_by_itself() {
    let instance = Instance::derive(Some("restart-test"), None).unwrap();
    let mut services = IndexMap::new();
    add_local_infra(&mut services, &instance, true);
    add_localstack_service(&mut services, &instance);
    let compose = dct::Compose {
        services: dct::Services(services),
        ..Default::default()
    };
    let local = serde_yaml::to_value(&compose).unwrap();
    let mut public = local.clone();
    apply_self_host(
        &mut public,
        &SelfHost {
            public_origin: Some("https://macro.example.com".into()),
            ..SelfHost::default()
        },
    );

    assert!(
        local["services"]
            .as_mapping()
            .unwrap()
            .values()
            .all(|service| service.get("restart").is_none())
    );
    let services = public["services"].as_mapping().unwrap();
    assert!(services.contains_key("db"));
    for (name, service) in services {
        assert_eq!(service["restart"], "unless-stopped", "{name:?}");
    }
}
