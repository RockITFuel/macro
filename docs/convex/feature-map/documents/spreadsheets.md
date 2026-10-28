# Spreadsheets

Native spreadsheets are collaborative workbooks with a formatting ribbon, formula bar, sheet tabs and a grid. People edit cells, formulas, tables, charts, images, checkboxes, dropdowns and comments together. An uploaded Excel or CSV file opens as a read-only preview; Edit in Macro creates a collaborative native copy and keeps the original. This is an internal pilot behind the `enable-spreadsheets` flag.

## Sub-features

- `sheet-create` creates an empty workbook from Create or New.
- `sheet-import` imports an uploaded `.xlsx`, `.xlsm` or `.csv` through Edit in Macro, or adds sheets through Import….
- `sheet-cells` covers cell entry, formula bar, formula autocomplete, reference picking, fill, move and copy.
- `sheet-format` covers number formats, fonts, fills, borders, wrapping, indent, row and column sizing, and View options.
- `sheet-tables` converts a range to a table with a header, filters, banding and a totals row.
- `sheet-validation` covers in-cell dropdowns and checkboxes.
- `sheet-charts` inserts and edits charts and images over cells.
- `sheet-find` opens find and replace, including formula matching.
- `sheet-comments` adds cell and range comments, with a workbook comments sidebar.
- `sheet-ask` opens Ask Macro with the selected cells attached.
- `sheet-dates-mentions` enters dates with a calendar and inserts Macro mentions into cells.

## How to get to it (user POV)

- Create → Spreadsheet.
- Files view or a folder: New → Spreadsheet. The workbook opens inline in the folder view.
- Open an uploaded `.xlsx`, `.xlsm` or `.csv` in Files or a channel. Choose Edit in Macro to make a native copy.
- Legacy links `/app/unknown/<uuid>` and CSV code routes show the same preview. `/app/spreadsheet/<uuid>` redirects into Drive on desktop.
- Formatting ribbon: Format and data (sorting, fill, Goal Seek, Convert to table, Dropdown…), Insert chart, image or checkbox, Number format, Find and replace, View options.
- Footer, bottom right: Import and export → Import….
- Shortcuts: Cmd/Ctrl+F (find), Cmd/Ctrl+Alt+T (convert to table), Cmd/Ctrl+Alt+M (comment), Cmd/Ctrl+D and Cmd/Ctrl+R (fill down and right), Ctrl+Alt+5 (first drawing).
- Header: Ask Macro sits left of Share. Comments sits in the header for the workbook sidebar.
- Phone: tap a cell once to select, tap it again to edit. Add rows is in the sheet actions menu.

## Driving it with chrome-devtools MCP

Preconditions:

- The `enable-spreadsheets` flag is on for the test account.
- A disposable workbook exists, or Create → Spreadsheet is available.
- A small CSV fixture is available for the import step.

- **Create workbook.** Click the button named `Create`, then the menu item `Spreadsheet`. Result: a grid opens with `A1` selected, and the status `Opening spreadsheet…` clears.
- **Enter values.** Type `Item`, press `Enter`, type `Amount` in `B1`, then enter numbers in `B2:B5`. Result: the grid shows the values.
- **Formula.** Select `B6`, type `=SUM(B2:B5)`, press `Enter`. Result: the cell shows the total, and the formula bar shows the formula text.
- **Convert to table.** Select `A1:B5` and press `Ctrl+Alt+T`. Result: a tab named `Table1` appears above the header row.
- **Import.** Click the button named `Import and export` at the bottom right, choose the menu item `Import…`, then `upload_file` the fixture. Result: a progress bar on `Import workbook` clears and the imported sheet appears.
- **Find.** Press `Cmd/Ctrl+F`, type a value in the find box. Result: a match count appears and the matching cell is selected.
- **Comment.** Select a cell and press `Cmd/Ctrl+Alt+M`. Result: a comment composer opens beside the cell.
- **Proof.** `take_screenshot` after the formula step, and a `take_snapshot` to read the formula bar value.

## Gotchas

- Wait for real cell text before reading values. Formula cells show a shimmer bar until results arrive.
- Cmd/Ctrl+F is captured by the grid, so the browser find bar never opens.
- The displayed result and the formula bar value differ for formulas. Check both.
- Insert, delete and move are disabled while a saved workbook is offline.
- Pivot tables are kept as their last values; Excel rebuilds them on open.
- Typing `5` in a percent cell means 5%. API and AI numeric values stay fractional.
- Typed dates follow the browser locale's day and month order.
- Use the button named `Choose a value for …` to open a dropdown list; the arrow appears only on dropdown cells.
- The workbook is a pilot. Confirm the team targeting in PostHog before testing with other accounts.
