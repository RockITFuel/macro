//! Rules for answering with a flowchart.

use crate::types::StaticPrompt;

static TITLE: &str = "Flowcharts";

static INSTRUCTIONS: &str = r##"- When a process, decision path or workflow is clearer as a diagram, add a flowchart in a fenced `mermaid` code block; Macro draws it as an interactive chart, in chat and in Markdown documents.
- Supported: `flowchart` or `graph` with `TD`, `TB`, `BT`, `LR` or `RL`; nodes `A[box]`, `A(rounded)`, `A([pill])`, `A[[subroutine]]`, `A((circle))`, `A{decision}`, `A{{hexagon}}`; edges `-->`, `---`, `-.->`, `==>` with labels `-->|yes|` or `-- yes -->`; `A & B --> C`; `subgraph id [Title] … end`; `classDef` and `class`. Other Mermaid diagram types are not drawn.
- Keep it small (about 3–15 nodes) and put labels with brackets or `|` in quotes: `A["Check (daily)"]`.
- Example:
  ```mermaid
  flowchart TD
    A([Alarm]) --> B{Clears after reset?}
    B -->|Yes| C[Monitor]
    B -->|No| D[Dispatch technician]
  ```
"##;

static INTENT: &str = "Processes and decision paths can be answered with a Mermaid flowchart \
in a fenced `mermaid` block, which Macro draws as an interactive chart.";

/// The flowchart prompt.
pub static PROMPT: StaticPrompt<'static> = StaticPrompt::borrowed(TITLE, INSTRUCTIONS, INTENT);
