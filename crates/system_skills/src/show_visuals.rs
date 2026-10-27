//! System skill for showing charts, tables and mockups as inline HTML pages.

use prompt::StaticPrompt;

use crate::SystemSkill;

static TITLE: &str = "Show Visuals";

static INSTRUCTIONS: &str = r##"Follow this skill when a chart, table, diagram, dashboard or mockup would say more than prose. You show it with `RenderHtml`: one self-contained HTML page, shown inline in the conversation above your reply and saved as an HTML document the user can open and share.

## When

- Use a page for comparisons, trends, breakdowns, several numbers at once, a timeline, a layout or design to look at, or a table too wide for markdown.
- Stay in prose for one number, a short list, a yes/no, or anything a sentence says as well.
- One page per answer. Call `RenderHtml` before your final reply; the reply adds only what the page does not say (the takeaway, a caveat, the next step). Do not announce the page or describe it.

## Page rules

- One document with inline `<style>` and `<script>`. It runs sandboxed: no network requests (`fetch`, XHR, websockets, remote images or fonts are blocked), no cookies or storage, no forms, no popups. Scripts may load from `cdn.jsdelivr.net`, `unpkg.com` or `cdnjs.cloudflare.com`; images must be inline `data:` URLs or SVG.
- The page sits on the conversation's background: no background on `html`, `body` or the outermost element, no outer card, border or title banner, and no horizontal padding on the outermost element.
- Fluid width: the column is about 728px on desktop and 360px on a phone. Wrap rows with `flex-wrap` or a grid with `minmax`, never a fixed page width, never horizontal scrolling of the whole page.
- Let content set the height. Never `100vh` or `height: 100%` on `html`/`body`. Give charts fixed pixel heights (160-320px). Pass `height` as the page's expected height; a shorter page shrinks the frame, a longer one scrolls inside it.
- Plain markup already looks like Macro: headings, paragraphs, `table`, `code`, `pre`, `hr`, `a` and `button` are styled. Add only layout and the parts plain markup does not cover.
- Links open in a new tab when clicked; there is no navigation inside the page.

## Macro's theme

The page gets Macro's current theme as CSS variables on `:root`, light or dark as the user has it, and they update when the user switches. Use them instead of your own colors, fonts and sizes; never hard-code a palette.

- Text: `--foreground`, `--muted-foreground` (secondary), `--subtle-foreground` (captions, axis labels), `--placeholder`.
- Surfaces: `--background` (the page itself; leave it transparent), `--card` (a raised box), `--muted` (a quiet fill), `--hover`, `--code-background`.
- Lines: `--border`, `--border-muted` (grid lines, row dividers).
- Accent: `--accent`, `--accent-foreground` (text on accent), `--accent-surface` (a tinted fill), `--link`.
- Status: `--success`, `--warning`, `--failure`.
- Charts: `--chart-1` ... `--chart-9`, Macro's series palette.
- Type: `--font-sans`, `--font-mono`, `--text-xs` (12px), `--text-sm` (13px), `--text-base` (14px), `--text-lg` (16px), `--text-xl` (20px), `--text-2xl` (24px).
- Shape and spacing: `--radius-sm`, `--radius` (8px), `--radius-lg`; `--space-1` (4px), `--space-2`, `--space-3`, `--space-4` (16px), `--space-6`, `--space-8`.

A box that must stand apart (a KPI tile, a mock screen) gets `background: var(--card)`, `border: 1px solid var(--border-muted)`, `border-radius: var(--radius)` and at least `var(--space-4)` padding.

## Charts

- Pick the form by the question: bars for comparing categories (sorted, horizontal when labels are long), a line for a trend over time, stacked bars or an area only when the parts add up to a meaningful total, a table when people will look up exact values. Avoid pies past four slices, dual axes, 3D and gradients.
- Color: series take `--chart-1`, `--chart-2`, ... in order and never repeat; one series is `--chart-1`. Use `--failure`/`--success` only for bad/good, not as series colors. Grid lines `--border-muted`, axis text `--subtle-foreground` at `--text-xs`.
- Label directly: put the series name at the end of its line or a value on each bar instead of a legend when it fits; always state units and the time range. Start bar axes at zero.
- Numbers: `font-variant-numeric: tabular-nums`, right-aligned in tables, rounded to what matters (1.4M, not 1,412,377.23), with a thousands separator.
- Prefer inline SVG for simple charts: `fill="var(--chart-1)"` works directly and stays sharp. For a chart library drawing on a canvas, read colors once with `getComputedStyle(document.documentElement).getPropertyValue("--chart-1")`.
- A KPI row is 2-4 tiles: the number large (`--text-2xl`, weight 600), a short label in `--muted-foreground` under it, a change in `--success` or `--failure` only when direction matters.

## Check before you finish

`RenderHtml` returns `warnings` when the page breaks a rule above: a resource the sandbox blocks, a viewport-height size, a hard-coded page background, no theme variables at all. Fix each one and call `RenderHtml` again; a page without warnings needs no second render. A failed call says what to change.
"##;

static INTENT: &str = "Charts, tables and mockups are shown as one self-contained RenderHtml page \
     styled only with Macro's theme variables and chart palette, following the sandbox and layout \
     rules, re-rendered when RenderHtml returns warnings, and never restated in the reply.";

/// The skill's instructions as a composable prompt section.
pub static PROMPT: StaticPrompt<'static> = StaticPrompt::borrowed(TITLE, INSTRUCTIONS, INTENT);

/// The show-visuals system skill.
pub static SKILL: SystemSkill = SystemSkill {
    slug: "show-visuals",
    name: "Show Visuals",
    content: &PROMPT,
};
