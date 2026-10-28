# Customers (CRM)

Customers is the sales workspace. It keeps companies and people (contacts) in lists, shows each company or contact's details, activity (tasks, emails, files, notes, calls) and discussion, and lets a team track deals in pipelines (tables of company or contact rows with stage, owner, and revenue). Records can be imported and exported as CSV.

## Sub-features

- `crm-companies` lists companies grouped by stage, with owner and revenue columns.
- `crm-people` lists contacts across the CRM-enabled teams you belong to, with search.
- `crm-activity` shows the Tasks, Email, Notes, and Calls tabs filtered to CRM-linked items (needs the `enable-crm-activity` flag).
- `crm-record` opens a company or contact: Overview, Team, Emails, Files, Tasks, Calls, side panel with Properties, Sharing, References, and Discussion.
- `crm-pipelines` creates, shares, edits, and trashes pipelines; Table and Board views; **Add deal** and **Add contact** dialogs.
- `crm-csv` imports companies and exports the list or a pipeline as CSV.
- `crm-lists` personal company lists (currently disabled by default).
- `crm-settings` the CRM settings page, including enabling CRM for a team.

## How to get to it (user POV)

- Sidebar **Customers** (route `/app/companies`); the Records section lists Companies, People, Tasks, Email, Notes, Calls.
- Sidebar **New** menu: **Company**, **Contact**, **Pipeline** (Pipeline only when CRM is enabled).
- Command palette (Ctrl/Cmd+K) and Go To navigation.
- `@` mention of a company or contact in a document or task, then open the chip.
- Search or favorites on desktop open a company or contact inside Customers.
- Settings → CRM, or **CRM settings** from inside Customers.
- Touch devices: the top tab strip (Companies, People, Tasks, Email, Notes, Calls, pipelines, lists) and the **+ Company** action above the dock.

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in on a team where CRM is enabled. Activity tabs also need the `enable-crm-activity` flag on (or `VITE_ENABLE_CRM_ACTIVITY=true`).
- Use a disposable company and pipeline. Hosted dev data is real.
- Re-take the snapshot after switching tabs or opening a record.

- **Open Customers.** Activate the sidebar link named **Customers**. Result: URL `/app/companies`, the Companies list is shown and grouped by stage.
- **Switch to People.** Activate the **People** entry under Records. Result: URL gains `s0.crm.tab=people`; the list shows names, company, and last contacted.
- **Search people.** Activate **Search people** and type a name. Result: matching contacts appear after a short pause.
- **Open a company.** Click a company row (or focus it and press Enter). Result: URL `/app/companies/company/<id>`, breadcrumb reads `Companies > <company>`, sidebar stays visible.
- **Return to the list.** Press browser Back, or activate the first breadcrumb segment. Result: the list returns with the same filters and scroll.
- **New company.** Activate the **New** menu, then **Company**. Type a name and a domain, then activate **Create company** (or Ctrl/Cmd+Enter). Result: the company appears in the list.
- **New pipeline.** Activate **New** then **Pipeline**. Type a name in the dialog, keep **Companies** in the record-type pill, and activate **Create pipeline**. Result: the pipeline opens as an editable table.
- **Add a deal.** On the pipeline page, activate **Add deal**, choose a company with **Find or add a company…**, then activate **Add deal** in the footer. Result: a new row appears in the table (within about five seconds on other viewers' screens).
- **Export CSV.** Open **Export** (for companies) or **Pipeline actions** then **Export CSV** (for a pipeline), then **Prepare export** and **Download CSV**. Result: a UTF-8 CSV download with company and domain columns.
- **Import CSV preview.** Activate **Import** in the Companies header, choose a CSV with a `Domain` column. Result: a preview of companies; nothing is written until **Import** is activated.
- **Settings.** Activate **CRM settings** in the sidebar. Result: the settings page replaces the list; the back arrow (**Close CRM settings**) returns to the same list.

## Gotchas

- Tasks, Email, Notes, and Calls tabs stay hidden unless `enable-crm-activity` is on; only Companies and People show otherwise.
- A new team has CRM off. **New pipeline** is disabled until CRM is enabled in CRM settings.
- Pipeline rows are independent of the company's own Stage, Owner, and Revenue. Editing one does not change the other.
- The Team, Files, Tasks, and Calls tabs on a company show items linked to the company or its contacts, not everything in the company's domain.
- Empty CRM scope never falls back to all content; an empty tab can be correct.
- Pipelines poll for changes every five seconds; a change from another viewer or from the AI tools can take that long to appear.
- Lists are disabled by default (`enableCrmLists` is off), so **New list** and list membership controls are absent.
- A pipeline's first column (the company or contact) cannot be removed or retyped.
- The import of a company with a personal domain such as gmail.com is skipped; these cannot be created as companies.
- Touch: on phones the Companies list uses the full-width list and a **+ Company** action above the dock, not the desktop **New** menu.
