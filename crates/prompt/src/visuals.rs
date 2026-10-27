//! When to show an HTML page inline and, in agent sessions, when to ask the
//! user a structured question.

use crate::types::StaticPrompt;

static TITLE: &str = "Showing Visuals";

/// The visuals guidance, shared by both prompts.
macro_rules! visuals {
    () => {
        r##"## Showing visuals

When a chart, table, diagram, dashboard or mockup would say more than prose - comparing numbers, a trend over time, a breakdown, a layout to choose - build one self-contained HTML page and call `RenderHtml` before your final reply. The reader sees the page inline, above the rest of your reply, and can open or share it as a document, so don't announce it, say where it is or restate it: add only what the page doesn't say. Keep short answers, single numbers and plain lists in prose.

Style the page with Macro's theme variables (`var(--foreground)`, `var(--muted-foreground)`, `var(--border)`, `var(--accent)`, `var(--chart-1)`...) instead of your own colors, so it matches the app in light and dark mode. Read the `Show Visuals` skill with `ReadSkill` before your first page in a conversation: it lists every variable, the page rules and how to draw charts. If `RenderHtml` returns `warnings`, fix them and render again; otherwise render once.
"##
    };
}

static INSTRUCTIONS: &str = visuals!();

static ASK_INSTRUCTIONS: &str = concat!(
    visuals!(),
    r##"
## Asking a question

When a decision only the user can make blocks the work - two real approaches, the scope of a change, which of several matches they meant - ask it with `AskUser` instead of guessing or asking in prose. Offer 2-4 short, distinct options with a one-sentence `description` each, recommended option first (say so in its description), and let the user type their own answer (`allowOther`, on by default). Set `multiSelect` when several can apply, and give options a `preview` (an ASCII layout, a snippet, a small table) when they are easier to compare by looking. Give it a `header` of a word or two. Ask one question at a time, only when the answer changes what you do next; don't ask for what you can look up, and never ask for passwords, keys or codes.
"##
);

static INTENT: &str = "The model shows charts, tables and mockups as one themed RenderHtml page \
     instead of prose, reads the Show Visuals skill before its first page, and does not restate \
     the page in its reply.";

static ASK_INTENT: &str = "In agent sessions the model also asks blocking decisions through \
     AskUser with 2-4 described options, Other, multi-select and previews, instead of guessing \
     or asking in prose.";

/// Visuals guidance for hosts that render `RenderHtml` but cannot ask (chat).
pub static PROMPT: StaticPrompt<'static> = StaticPrompt::borrowed(TITLE, INSTRUCTIONS, INTENT);

/// Visuals and `AskUser` guidance for agent sessions.
pub static SESSION_PROMPT: StaticPrompt<'static> =
    StaticPrompt::borrowed(TITLE, ASK_INSTRUCTIONS, ASK_INTENT);
