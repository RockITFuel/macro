# Search

Search finds the user's work across Macro by name or by full text. A search page lists matching items as the user types, grouped by category (All, Email, Agents, Files, Tasks, Projects, Channels, People). Full-text mode also matches message and document content and shows an excerpt; opening a result jumps to the matching message, passage, or page. Going Back returns to the same query, category, and scroll position. A query with no matches shows an explicit empty state, distinct from a failed search.

## Sub-features

- `search-open` opens the search page from the sidebar, the keyboard, or the command menu, with the query box focused.
- `search-name` matches entity names live, with no Enter needed; People also finds known teammates before a first DM.
- `search-fulltext` searches message and document content from the `Search full text for "…"` row.
- `search-categories` filters results by category without changing the query.
- `search-open-result` opens a result at its matching message, passage, page, or turn, and re-targets the same snippet on repeat clicks.
- `search-empty` shows the empty state for a query with no matches.
- `search-clear` clears the query (including whitespace) and keeps the category.
- `search-history` restores query, category, mode, and scroll position when the user goes Back.

## How to get to it (user POV)

- Sidebar `Search`, then `Search everything` (opens `/app/search`), or `Command Menu` to jump by name.
- Keyboard: `/` opens search when no editor or input has focus.
- Command menu (`Ctrl+K`) for name jumps; full search from `Search everything`.
- Phones: the dock's `Search` button opens a persistent `Search…` input at `/app/search`.
- Shift-click `Search everything` to open search in a new split.

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in (email-code sign-in; see the agent guide's login page). A document or channel message exists whose title is `Quarterly plan` and whose body contains `budget`; create it first if missing.
- Search is not already open in another split.

- **Toolbar entry.** `take_snapshot`, `click` the sidebar button `Search`, then `click` the menu item `Search everything`. The search page opens with the query box focused.
- **Keyboard entry.** `press_key` `Escape` to leave the box, then `press_key` `/` with focus on the page body. The search page opens and no slash appears in the query.
- **Name match.** `type_text` "quarterly" into the query box. The results list contains `Quarterly plan`.
- **Full text.** Clear the query and type "budget". Click the row `Search full text for “budget”` if it is not already selected. The result `Quarterly plan` shows an excerpt containing "budget".
- **Open a result.** `click` the result `Quarterly plan`. The document or channel opens; for a channel message it opens at the matching message.
- **Back.** `navigate_page` back (or `press_key` `Alt+ArrowLeft`). The search results return with the same query and category.
- **Empty state.** Replace the query with "volcano". Wait for the empty-state status to appear (its exact wording is unverified; look for a status or "no matches" text), not a fixed delay.
- **Clear.** `click` the button `Clear search`. The query is empty and the recent-items list replaces results.
- **Proof.** `take_snapshot` with results visible, then `take_screenshot`. Proof shows the query, the category, and the result row.

## Gotchas

- Results update after a short debounce; wait for the results list or the empty status to appear.
- Archived items are excluded unless the user enables `Include archived`.
- Pressing `/` while an editor or the query box has focus types a slash instead of opening search.
- A full-text query shorter than the service minimum is rejected with a validation message; name mode has no minimum.
- Opening a result changes browser state. Re-open search before proving a second query.
- Email name search covers only email already cached in Macro; older mail needs full-text search.
- Projects is name-only: the full-text row does not appear for it.
- Agent-session results show a robot icon and open the session at the matching turn; legacy chat rows do not offer rename or delete on search rows.
