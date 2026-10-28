# Search and filter mail

Search and filter lets a user find email threads by text inside the Email view and narrow the current mailbox with a filter menu covering read state, done state, attachments, calendar mail, tags, and the connected inbox. Filters apply to the whole mailbox before pagination, so unread mail is found even when many newer threads are read.

## Sub-features

- `search-open` opens the search field from the Email view with `Ctrl+F` or `/`.
- `search-text` returns matching threads for a text query, scoped to the current tab and inbox.
- `search-filter-menu` opens the filter menu with `f`.
- `search-status` filters to Unread or Read, and Done state, as single choices that close the menu.
- `search-attachments` narrows to threads with attachments, with a multiple-choice menu that stays open.
- `search-tags` filters by one or more personal tags, with a searchable list that pins selected tags first.
- `search-clear` clears one refinement or all filters with `Clear` or `Reset filters`.

## How to get to it (user POV)

- Press `Ctrl+F` or `/` while the Email view is focused.
- Choose the search control in the Email view header (control name unverified).
- Press `f` to open the filter menu; on mobile, use the filter button beside the Signal and Noise pills.
- Mobile: the filter drawer lists the same refinements with a `Clear all` action.

## Driving it with chrome-devtools MCP

Preconditions:

- The web app is running and signed in as a disposable user with one connected inbox.
- The mailbox contains a thread with the subject `Quarterly plan` and a thread with an attachment.
- At least one thread is unread and one is read, and at least one tag exists.
- The Email view is at `/app/component/mail`.

- **Keyboard search.** Click the page body, outside any field, then press `/`. Observable result: a search input gets focus and no slash is typed into it.
- **Text match.** Type `Quarterly plan` into the search input and wait for results. Observable result: the list contains the matching thread subject and no unrelated rows.
- **Clear search.** Clear the input. Observable result: the mailbox list returns to its tab with no query text.
- **Filter menu.** Press `f`. Observable result: a filter menu opens with `Status`, `Done`, `Attachments`, and `Tags` sections (section names unverified; match by visible text).
- **Unread only.** In the Status section choose `Unread`. The menu closes. Observable result: only unread threads remain, and a thread you mark read keeps its position until the list refreshes.
- **Attachments.** Open the attachments section and select a file type. The menu stays open. Observable result: only threads with a matching attachment appear.
- **Tags.** Open the tags section, type in its search field, and select a tag. Observable result: the tag is pinned at the top when the section reopens, and the list narrows to that tag.
- **Clear filters.** Choose `Clear filters` or `Reset filters`. Observable result: the list returns to the unfiltered tab.

## Gotchas

- Search results never show attachment paperclips, because search-service hits carry no attachment data.
- Search cannot filter archive state on the server side; within the Archived tab, archived hits are kept on the client.
- Pressing `/` while a text field has focus types the character instead of opening search.
- The filter menu closes after a single-choice Status or Done pick, but Attachments and Tags stay open for several picks.
- Changing the query, tab, inbox, or any filter restarts pagination; do not assume the previous Load more position still applies.
- Search inside Favorites is restricted to favorited threads.
- Read-state discovery uses lookups bounded to 100 already-admitted threads; a confirmed non-match removes a row that no longer matches.
