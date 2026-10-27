use super::*;
use crate::inbound::toolset::edit_document::test::{
    FakeDocumentService, FakeEditingWorker, request_context, tool_context,
};

fn page(title: &str, html: &str, height: u32) -> RenderHtml {
    RenderHtml {
        title: title.to_owned(),
        html: html.to_owned(),
        height,
    }
}

#[test]
fn clamps_the_height_and_trims_the_title() {
    assert_eq!(
        page("  Revenue  ", "<p>hi</p>", 10).validated().unwrap(),
        ("Revenue".to_owned(), MIN_HEIGHT)
    );
    assert_eq!(
        page("Revenue", "<p>hi</p>", 9_000).validated().unwrap(),
        ("Revenue".to_owned(), MAX_HEIGHT)
    );
    assert_eq!(
        page("Revenue", "<p>hi</p>", 420).validated().unwrap().1,
        420
    );
}

#[test]
fn accepts_a_page_at_the_size_limit() {
    let html = "x".repeat(MAX_HTML_BYTES);
    assert!(page("Big", &html, 400).validated().is_ok());
}

#[tokio::test]
async fn rejects_bad_pages_before_creating_a_document() {
    let long_title = "t".repeat(MAX_TITLE_CHARS + 1);
    let too_big = "x".repeat(MAX_HTML_BYTES + 1);
    for (call, expected) in [
        (
            page("   ", "<p>hi</p>", 400),
            "RenderHtml requires a non-empty title.".to_owned(),
        ),
        (
            page(&long_title, "<p>hi</p>", 400),
            format!("RenderHtml title must be at most {MAX_TITLE_CHARS} characters."),
        ),
        (
            page("Empty", "  \n ", 400),
            "RenderHtml requires a non-empty html document.".to_owned(),
        ),
        (
            page("Huge", &too_big, 400),
            "The page is 257 KB; RenderHtml takes at most 256 KB. Shrink inline data (images, datasets) or split it into several pages.".to_owned(),
        ),
    ] {
        // The shared fake panics if creation is reached.
        let context = tool_context(
            FakeDocumentService::new("html"),
            FakeEditingWorker::default(),
        );
        let error = call
            .call(context, request_context())
            .await
            .expect_err("the page is rejected");
        assert_eq!(error.description, expected);
    }
}

#[test]
fn a_themed_page_has_no_warnings() {
    let html = r#"<!doctype html><html><head><script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>.tile{background:var(--card);border:1px solid var(--border-muted);padding:var(--space-4)}
svg{height:200px}</style></head><body><div class="tile"><b>1.4M</b></div>
<svg><rect fill="var(--chart-1)" width="40" height="80"/></svg>
<img src="data:image/png;base64,AAAA"><a href="https://example.com">Report</a></body></html>"#;
    assert_eq!(page_warnings(html), Vec::<String>::new());
}

#[test]
fn warns_about_what_the_sandbox_and_layout_break() {
    let html = r#"<html><head><script src="https://evil.example/x.js"></script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto">
<style>body{background:#111;color:#eee} .wrap{height:100vh;width:1200px}
@import url("https://cdn.example/a.css");</style></head>
<body><img src="https://example.com/pixel.png"><form></form>
<script>fetch('/api'); localStorage.setItem('a','b')</script></body></html>"#;
    let warnings = page_warnings(html);
    let has = |needle: &str| warnings.iter().any(|warning| warning.contains(needle));
    assert!(
        has("The script https://evil.example/x.js is blocked"),
        "{warnings:#?}"
    );
    assert!(
        has("<link> resource https://fonts.googleapis.com"),
        "{warnings:#?}"
    );
    assert!(
        has("<img> resource https://example.com/pixel.png"),
        "{warnings:#?}"
    );
    assert!(
        has("stylesheet resource https://cdn.example/a.css"),
        "{warnings:#?}"
    );
    assert!(has("`fetch` will fail"), "{warnings:#?}");
    assert!(has("`localStorage` throws"), "{warnings:#?}");
    assert!(has("Forms cannot be submitted"), "{warnings:#?}");
    assert!(has("Viewport heights"), "{warnings:#?}");
    assert!(warnings.len() <= 8, "bounded: {warnings:#?}");
}

#[test]
fn warns_about_page_backgrounds_widths_and_a_missing_theme() {
    let warnings = page_warnings(
        "<style>html { background-color: white } .chart{width:960px;color:#333}</style><p>x</p>",
    );
    let has = |needle: &str| warnings.iter().any(|warning| warning.contains(needle));
    assert!(has("html/body has background white"), "{warnings:#?}");
    assert!(has("fixed width of 960px"), "{warnings:#?}");
    assert!(has("none of Macro's theme variables"), "{warnings:#?}");

    // A transparent page and a narrow box are fine.
    assert!(
        page_warnings(
            "<style>body{background:transparent} .box{width:320px;color:var(--foreground)}</style>"
        )
        .is_empty()
    );
}
