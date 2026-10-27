//! The page check behind `RenderHtml`'s `warnings`: rules a page breaks that
//! the sandbox or the layout will punish, found without running it, each
//! worded as what to change.

use std::sync::LazyLock;

use regex::Regex;

/// Hosts a page may load scripts from; everything else is blocked.
pub const SCRIPT_HOSTS: [&str; 3] = ["cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com"];

/// Most warnings returned, so a broken page cannot flood the context.
const MAX_WARNINGS: usize = 8;

static SCRIPT_SRC: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)<script\b[^>]*\bsrc\s*=\s*["']?((?:https?:)?//[^"'\s>]+)"#)
        .expect("valid regex")
});
static REMOTE_RESOURCE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(?is)<(img|link|source|video|audio|iframe|embed|object|track|input)\b[^>]*\b(?:src|href|srcset|data|poster)\s*=\s*["']?((?:https?:)?//[^"'\s>]+)"#,
    )
    .expect("valid regex")
});
static CSS_REMOTE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)(?:url\(\s*["']?|@import\s+["'])((?:https?:)?//[^"')\s]+)"#)
        .expect("valid regex")
});
static NETWORK_API: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"\b(fetch\s*\(|XMLHttpRequest|new\s+WebSocket|new\s+EventSource|navigator\.sendBeacon)",
    )
    .expect("valid regex")
});
static STORAGE_API: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b")
        .expect("valid regex")
});
static FORM: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)<form\b").expect("valid regex"));
static VIEWPORT_HEIGHT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b\d+(?:\.\d+)?[sdl]?vh\b|(?:^|[;{\s])(?:min-)?height\s*:\s*100%")
        .expect("valid regex")
});
static PAGE_BACKGROUND: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?is)(?:^|[}\s,>])(?:html|body|:root)\s*\{[^}]*\bbackground(?:-color)?\s*:\s*([^;}]+)",
    )
    .expect("valid regex")
});
static FIXED_WIDTH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(?:^|[;{\s])(?:min-)?width\s*:\s*(\d{4,}|7[5-9]\d|[89]\d\d)px")
        .expect("valid regex")
});
static HARD_COLOR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(").expect("valid regex"));

/// The host of a `//host/...` or `https://host/...` URL.
fn host(url: &str) -> &str {
    let rest = url
        .trim_start_matches("https:")
        .trim_start_matches("http:")
        .trim_start_matches("//");
    rest.split(['/', '?', '#', ':']).next().unwrap_or(rest)
}

/// What to fix in `html` before it renders as intended. Empty when nothing
/// stands out.
#[must_use]
pub fn page_warnings(html: &str) -> Vec<String> {
    let mut warnings = Vec::new();
    for found in SCRIPT_SRC.captures_iter(html) {
        let url = &found[1];
        if !SCRIPT_HOSTS.contains(&host(url)) {
            warnings.push(format!(
                "The script {url} is blocked. Load scripts from {} only, or inline them.",
                SCRIPT_HOSTS.join(", ")
            ));
        }
    }
    for found in REMOTE_RESOURCE.captures_iter(html) {
        warnings.push(format!(
            "The <{}> resource {} is blocked: the page can load nothing remote. Inline images as data: URLs or SVG and styles in <style>.",
            found[1].to_ascii_lowercase(),
            &found[2]
        ));
    }
    for found in CSS_REMOTE.captures_iter(html) {
        warnings.push(format!(
            "The stylesheet resource {} is blocked (remote fonts and images too). Use the theme's --font-sans and data: URLs.",
            &found[1]
        ));
    }
    if let Some(found) = NETWORK_API.find(html) {
        warnings.push(format!(
            "`{}` will fail: the page cannot make network requests. Put the data in the page.",
            found.as_str().trim_end_matches(['(', ' '])
        ));
    }
    if let Some(found) = STORAGE_API.find(html) {
        warnings.push(format!(
            "`{}` throws in the sandbox: the page has no cookies or storage. Keep state in variables.",
            found.as_str()
        ));
    }
    if FORM.is_match(html) {
        warnings.push(
            "Forms cannot be submitted in the sandbox. Use buttons with click handlers instead."
                .to_owned(),
        );
    }
    if VIEWPORT_HEIGHT.is_match(html) {
        warnings.push(
            "Viewport heights (vh, height: 100%) make the frame grow with itself. Let content set the height and give charts fixed pixel heights."
                .to_owned(),
        );
    }
    if let Some(found) = PAGE_BACKGROUND.captures(html) {
        let value = found[1].trim();
        if !matches!(
            value,
            "transparent" | "none" | "inherit" | "initial" | "unset"
        ) {
            warnings.push(format!(
                "html/body has background {value}; leave the page transparent so it sits on the conversation, and use var(--card) on boxes that must stand apart."
            ));
        }
    }
    if let Some(found) = FIXED_WIDTH.captures(html) {
        warnings.push(format!(
            "A fixed width of {}px is wider than the reply column (about 728px, 360px on phones). Use fluid widths with max-width.",
            &found[1]
        ));
    }
    if !html.contains("var(--") && HARD_COLOR.is_match(html) {
        warnings.push(
            "The page uses its own colors and none of Macro's theme variables, so it will clash in light or dark mode. Use var(--foreground), var(--muted-foreground), var(--border), var(--accent) and var(--chart-1)... (see the Show Visuals skill)."
                .to_owned(),
        );
    }
    warnings.dedup();
    warnings.truncate(MAX_WARNINGS);
    warnings
}
