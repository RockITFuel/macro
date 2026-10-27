use std::sync::{Arc, Mutex};

use ai_toolset::{AsyncTool as _, RequestContext, ServiceContext};
use async_trait::async_trait;
use macro_user_id::user_id::MacroUserIdStr;

use super::*;
use crate::domain::user_input::{UserInputAnswer, UserInputError, UserInputRequester};

struct FakeRequester {
    requests: Mutex<Vec<UserInputRequest>>,
    response: UserInputOutcome,
}

#[async_trait]
impl UserInputRequester for FakeRequester {
    async fn ask(&self, request: UserInputRequest) -> Result<UserInputOutcome, UserInputError> {
        self.requests
            .lock()
            .expect("request lock should not be poisoned")
            .push(request);
        Ok(self.response.clone())
    }
}

fn ask(question: &str, options: Vec<AskUserOption>) -> AskUser {
    AskUser {
        question: question.to_owned(),
        header: None,
        options,
        multi_select: false,
        allow_other: true,
    }
}

fn labels(labels: &[&str]) -> Vec<AskUserOption> {
    labels
        .iter()
        .map(|label| AskUserOption {
            label: (*label).to_owned(),
            description: None,
            preview: None,
        })
        .collect()
}

fn fake(response: UserInputOutcome) -> Arc<FakeRequester> {
    Arc::new(FakeRequester {
        requests: Mutex::new(Vec::new()),
        response,
    })
}

fn context(requester: &Arc<FakeRequester>) -> ServiceContext<AskUserContext> {
    ServiceContext(AskUserContext {
        requester: Some(requester.clone()),
    })
}

fn request_context() -> RequestContext {
    RequestContext::new(
        MacroUserIdStr::try_from("macro|ask-user-test@example.com".to_owned())
            .expect("test user id should be valid"),
    )
}

#[tokio::test]
async fn asks_through_the_port_and_returns_the_answer() {
    let requester = Arc::new(FakeRequester {
        requests: Mutex::new(Vec::new()),
        response: UserInputOutcome::Answered(UserInputAnswer::option("blue")),
    });
    let response = ask(
        "  What is the best colour?  ",
        labels(&["red", " blue ", "red", ""]),
    )
    .call(
        ServiceContext(AskUserContext {
            requester: Some(requester.clone()),
        }),
        request_context(),
    )
    .await
    .expect("the question should succeed");

    assert_eq!(
        response,
        AskUserResponse::Answered {
            selected: vec!["blue".to_owned()],
            other: None,
        }
    );
    assert_eq!(
        *requester
            .requests
            .lock()
            .expect("request lock should not be poisoned"),
        vec![UserInputRequest {
            question: "What is the best colour?".to_owned(),
            header: None,
            options: vec![
                UserInputOption::label("red"),
                UserInputOption::label("blue")
            ],
            multi_select: false,
            allow_other: true,
        }]
    );
}

#[tokio::test]
async fn preserves_decline_and_cancel_as_successful_tool_results() {
    for (outcome, expected) in [
        (UserInputOutcome::Declined, AskUserResponse::Declined),
        (UserInputOutcome::Cancelled, AskUserResponse::Cancelled),
    ] {
        let response = ask("Continue?", labels(&["yes", "no"]))
            .call(
                ServiceContext(AskUserContext {
                    requester: Some(Arc::new(FakeRequester {
                        requests: Mutex::new(Vec::new()),
                        response: outcome,
                    })),
                }),
                request_context(),
            )
            .await
            .expect("decline and cancel are user decisions, not tool failures");
        assert_eq!(response, expected);
    }
}

#[tokio::test]
async fn fails_clearly_without_client_support() {
    let error = ask("Continue?", Vec::new())
        .call(
            ServiceContext(AskUserContext { requester: None }),
            request_context(),
        )
        .await
        .expect_err("an unsupported client cannot be asked");

    assert_eq!(
        error.description,
        "This client cannot show an interactive question."
    );
}

#[tokio::test]
async fn rejects_an_empty_question_without_calling_the_port() {
    let requester = Arc::new(FakeRequester {
        requests: Mutex::new(Vec::new()),
        response: UserInputOutcome::Answered(UserInputAnswer::text("unused")),
    });
    let error = ask("   ", Vec::new())
        .call(
            ServiceContext(AskUserContext {
                requester: Some(requester.clone()),
            }),
            request_context(),
        )
        .await
        .expect_err("an empty question should be rejected");

    assert_eq!(error.description, "AskUser requires a non-empty question.");
    assert!(
        requester
            .requests
            .lock()
            .expect("request lock should not be poisoned")
            .is_empty()
    );
}

#[tokio::test]
async fn a_cancelled_turn_does_not_start_a_question() {
    let requester = Arc::new(FakeRequester {
        requests: Mutex::new(Vec::new()),
        response: UserInputOutcome::Answered(UserInputAnswer::text("unused")),
    });
    let request_context = request_context();
    request_context.cancel.cancel();

    let response = ask("Continue?", Vec::new())
        .call(
            ServiceContext(AskUserContext {
                requester: Some(requester.clone()),
            }),
            request_context,
        )
        .await
        .expect("turn cancellation is a successful cancelled tool result");

    assert_eq!(response, AskUserResponse::Cancelled);
    assert!(
        requester
            .requests
            .lock()
            .expect("request lock should not be poisoned")
            .is_empty()
    );
}

#[test]
fn options_deserialize_from_plain_labels_and_full_objects() {
    let call: AskUser = serde_json::from_value(serde_json::json!({
        "question": "Which library?",
        "header": "Library",
        "options": [
            "date-fns",
            { "label": "Temporal", "description": "Native, recommended", "preview": "Temporal.Now.plainDateISO()" }
        ],
        "multiSelect": true
    }))
    .expect("both option shapes should deserialize");

    assert_eq!(call.header.as_deref(), Some("Library"));
    assert!(call.multi_select);
    assert!(call.allow_other, "Other defaults on");
    assert_eq!(
        call.options,
        vec![
            AskUserOption {
                label: "date-fns".to_owned(),
                description: None,
                preview: None,
            },
            AskUserOption {
                label: "Temporal".to_owned(),
                description: Some("Native, recommended".to_owned()),
                preview: Some("Temporal.Now.plainDateISO()".to_owned()),
            },
        ]
    );
}

#[tokio::test]
async fn passes_header_descriptions_previews_and_multi_select_through() {
    let requester = fake(UserInputOutcome::Answered(UserInputAnswer {
        selected: vec!["Charts".to_owned(), "Tables".to_owned()],
        other: None,
    }));
    let mut call = ask(
        "What should the report include?",
        vec![
            AskUserOption {
                label: "Charts".to_owned(),
                description: Some("  Bar and line charts  ".to_owned()),
                preview: Some("[####    ]".to_owned()),
            },
            AskUserOption {
                label: "Tables".to_owned(),
                description: Some("   ".to_owned()),
                preview: None,
            },
        ],
    );
    call.header = Some("  Report contents that is far too long for a chip  ".to_owned());
    call.multi_select = true;

    let response = call
        .call(context(&requester), request_context())
        .await
        .expect("the question should succeed");

    assert_eq!(
        response,
        AskUserResponse::Answered {
            selected: vec!["Charts".to_owned(), "Tables".to_owned()],
            other: None,
        }
    );
    let requests = requester.requests.lock().expect("request lock");
    let request = &requests[0];
    assert_eq!(
        request.header.as_deref(),
        Some("Report contents that is far too long for"),
        "the header is cut to a chip"
    );
    assert!(request.multi_select);
    assert!(request.allow_other);
    assert_eq!(
        request.options[0].description.as_deref(),
        Some("Bar and line charts")
    );
    assert_eq!(request.options[0].preview.as_deref(), Some("[####    ]"));
    assert_eq!(
        request.options[1].description, None,
        "blank text is dropped"
    );
}

#[tokio::test]
async fn a_free_text_question_never_offers_other() {
    let requester = fake(UserInputOutcome::Answered(UserInputAnswer::text("Friday")));
    let response = ask("When should it ship?", Vec::new())
        .call(context(&requester), request_context())
        .await
        .expect("the question should succeed");

    assert_eq!(
        response,
        AskUserResponse::Answered {
            selected: Vec::new(),
            other: Some("Friday".to_owned()),
        }
    );
    assert!(!requester.requests.lock().expect("request lock")[0].allow_other);
}

#[tokio::test]
async fn rejects_choices_outside_two_to_four_options_and_bare_multi_select() {
    for (options, multi_select, expected) in [
        (
            labels(&["only"]),
            false,
            "AskUser offers 2-4 distinct options, or none for a free-text question; got 1.",
        ),
        (
            labels(&["a", "b", "c", "d", "e"]),
            false,
            "AskUser offers 2-4 distinct options, or none for a free-text question; got 5.",
        ),
        (
            labels(&["same", "same"]),
            false,
            "AskUser offers 2-4 distinct options, or none for a free-text question; got 1.",
        ),
        (
            Vec::new(),
            true,
            "AskUser multiSelect needs options to choose from.",
        ),
    ] {
        let requester = fake(UserInputOutcome::Cancelled);
        let mut call = ask("Pick", options);
        call.multi_select = multi_select;
        let error = call
            .call(context(&requester), request_context())
            .await
            .expect_err("the call is malformed");
        assert_eq!(error.description, expected);
        assert!(requester.requests.lock().expect("request lock").is_empty());
    }
}

#[tokio::test]
async fn rejects_an_oversized_preview() {
    let requester = fake(UserInputOutcome::Cancelled);
    let mut options = labels(&["a", "b"]);
    options[0].preview = Some("x".repeat(4_001));
    let error = ask("Pick", options)
        .call(context(&requester), request_context())
        .await
        .expect_err("the preview is too long");
    assert_eq!(
        error.description,
        "AskUser option previews must be at most 4000 characters."
    );
}
