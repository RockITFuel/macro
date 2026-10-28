# Databases

A database is a named workspace of tables. Each table holds records with typed columns (text, number, select, multi-select, date, checkbox, URL, people, documents, tasks, relations to other tables, formula), shown as a grid and optionally as stored Table or Board views. Edits save as you make them, undo covers your own last edits, and people can ask questions of a database in plain language and get a live answer.

## Sub-features

- `db-create` creates a database, a table, and a first Name column, from the menus or the keyboard.
- `db-grid-edit` edits cells, rows, and multi-cell selections; opens the record dialog.
- `db-schema` adds, renames, reorders, converts, and deletes columns and tables; manages select options; builds formula columns.
- `db-views` creates, renames, filters, sorts, and deletes Table and Board views; moves cards and lanes on a Board.
- `db-search` searches across every table of a database (Ctrl/Cmd+F).
- `db-undo` undoes and redoes your own last edits (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z).
- `db-share-io` shares a database, imports and exports CSV, and manages webhooks.
- `db-ai-answers` asks a question of a database in the AI pane or with `/query` in a document, and gets a table, a value, or a chart.
- `db-starter` provisions one "Getting started" example database for a new user (once only).

## How to get to it (user POV)

- Open the **Create** menu and choose **Database**. The keyboard path is **C** then **L**.
- Press **Ctrl-K** and open a database from the list. The list refreshes when a database was created elsewhere, so it shows without a reload.
- In the sidebar or Home, choose a database card. Databases open at `/app/database/<id>`.
- From Drive, use **New → Database** (opens inline under Drive, `/app/drive/database/<id>`) or open one from its list or favorites.
- In a document, type `/database` to insert a new database editor; type `@` and pick a database to insert a compact chip that expands to the editor.
- In a document or composer, type `/query` and choose **Query** to ask a question of a database.
- In the database's split header, choose **AI** to open a chat about this database.
- Mobile: databases open from the same navigation; there is no separate mobile entry point documented in the agent guide (unverified).

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in to the web app on a team with the `enable-databases` flag on (or the local override `VITE_ENABLE_DATABASES=true`).
- Use a disposable database. Writes change hosted data.
- Open the app in the user-visible tab. Re-take the snapshot after each navigation or view change.

- **Create a database.** Activate the **Create** menu button, then the **Database** menu item (or press `c` then `l`). Result: a new database opens at `/app/database/<id>` with the split header showing the database name and a table tab. Name cell is the first editable column.
- **Add a column.** Activate **Add column** after the grid headers. Result: a column named **Unnamed** is created and its name is selected; type a name and press Enter. The cursor moves to the first cell of that column.
- **Edit a cell.** Click a cell (or focus it with arrow keys) and type. Press Enter to save and move down, Tab to save and move right. Result: the value remains after a reload, and the cell's last write wins if another person edits it.
- **Open the record dialog.** Right-click a row number and choose **Open record**, or click the row number. Result: a compact dialog with the record name and all properties; Escape closes it.
- **Change a column type.** Open the column header arrow menu and choose **Change type**. Result: a list of only the types the column can convert to; a converted value that does not fit is placed in a new column instead of altering this one.
- **Add a table.** Activate the **+** at the right end of the table tabs and choose **New table**. Type a name and press Enter. Result: a new tab with a Name column.
- **Add a view.** Activate the **+** beside the view tabs, then **Board** (or **Table**). Result: a new view tab opens immediately with the current filter and sort kept.
- **Filter a view.** Activate **Filter**, then **Add condition**. Result: rows narrow to the condition; the grid's bottom summary reflects saved records in the current view.
- **Search the database.** Press Ctrl+F (Cmd+F on macOS) with focus in the database. Result: grouped results by table; Enter opens the matching row or record. The grid is not filtered by search.
- **Undo.** Make one cell edit, then press Ctrl+Z (Cmd+Z). Result: your edit reverts; a later edit by someone else is kept. Ctrl+Shift+Z redoes.
- **Ask a question.** Activate **AI**, type a question in the composer and send. Result: the answer appears inline as a result table or a value; no SQL is shown.
- **Export CSV.** Open **Database actions** (`...`), choose **Download** then **Current table as CSV**. Result: a file with all records, regardless of filters.
- **Share.** Activate **Share** in the split header. Result: the standard sharing dialog; no public link is offered.

## Gotchas

- With `enable-databases` off, the URL shows the 404 view and no database entry exists in menus, search, or the command palette. Check the flag before concluding a database is missing.
- A freshly opened database link waits up to about three seconds for the flag before it decides.
- Pressing `n` or typing while a text input has focus types text; it does not open a new record.
- Records without a value in a Board's grouping column do not appear on the board; they remain in the table.
- A Board's card drag can only be undone if the card's position is not part of a regroup; a refused undo changes nothing and shows no partial success.
- Pipelines (CRM sales pipelines) use this same grid but do not appear in the Databases list; see the `crm` feature.
- SQL is never shown to people; the SQL toggle appears only in development builds with `VITE_SHOW_DATABASE_SQL=true`.
- A stale table after a rename: saved answers name tables and columns by their display names, so renaming one makes the answer fail until the question is updated.
- Concurrent edits: after your own edit the grid re-reads rows. Wait for the refresh to finish before asserting on server-reconciled state.
