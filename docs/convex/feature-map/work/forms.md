# Forms

A form is a questionnaire whose answers are saved as rows of a database table. Each question is a column of that table. A builder lets an editor arrange sections, questions, required flags, and gates (conditions that show a later section or stop a response), preview the respondent view, and read responses in a grid. Respondents fill in the form in the app or anonymously, may edit their answer while the form is open, and can be sent to book a time at the end. Channels can also hold quick polls.

## Sub-features

- `form-create` creates a form and its table from Create, Drive, a database, or a channel composer.
- `form-build` the builder: add sections and questions, reorder with drag, outline navigation, rename, convert types, preview.
- `form-gates` gate sections whose rules send respondents on or stop them; rules are checked before the next section.
- `form-responses` the Responses tab: summary tiles and the linked table's grid.
- `form-settings` who can respond, open or closed, close date, results visibility, confirmation message, share access.
- `form-respond` the respond page: one section per screen, Back and Next, Submit, edit-my-response, receipt.
- `form-booking` a final booking step that opens a time picker after acceptance.
- `form-poll` channel polls: question, options, multiple answers, voting in the message.

## How to get to it (user POV)

- **Create** menu → **Form** (keyboard **C** then **Q**; Shift opens it in a new split). Creates "Untitled form" and opens the builder.
- Drive **New → Form** opens the form inline under Drive.
- On a database you own, **+ → New form** in the table selector creates a form over that table (one form per table).
- In a channel composer: type `/form` to create a form beside the channel, or `/poll` for a poll.
- Opening a form link `/app/form/<id>` opens the builder for editors and the respond page for respondents.
- Forms in Drive and Quick Access (Forms bucket) list forms you can open, including ones shared with you.
- Only when the `enable-forms` flag is on does the builder, the Create entry, `/poll`, `/form`, and the database form control appear. Responding does not depend on the flag.

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in with the `enable-forms` flag on (or `VITE_ENABLE_FORMS=true`) for builder steps. Respond steps work without the flag.
- A disposable form. Creating a form creates a database table.
- Snapshot after each step; the builder re-renders often.

- **Create a form.** Activate the **Create** menu, then **Form** (or press `c` then `q`). Result: a builder opens at `/app/form/<id>` with the title "Untitled form".
- **Add a section.** Activate **Add section** below the canvas. Result: a new question section appears; its **Add question** menu is open or available.
- **Add a question.** Activate **Add question** in a section and choose a type (for example short answer). Result: the question appears in the canvas and in the left **Outline**; type its title in the title input.
- **Make a question required.** Select the question and switch **Required** on at the bottom right. Result: a **Required** badge appears under its answer preview.
- **Add a gate.** Activate **Add gate**, then **Add rule** in the gate's editor, and pick an earlier question and a value. Result: gate row saved once complete; a broken rule shows **Remove broken rules**.
- **Preview.** Activate **Preview**. Result: a new tab shows the respondent experience; it creates no response rows.
- **Settings.** Open the **Settings** tab in the form's top pill tabs. Result: who-can-respond, accepting responses, and confirmation settings are shown.
- **Respond.** Open `/app/form/<id>/respond` (or **Open form**). Fill a required field and activate **Next**, then **Submit** on the last section. Result: confirmation with a receipt; **Edit my response** appears for signed-in respondents while the form is open.
- **Read responses.** Open the **Responses** tab. Result: summary tiles (Responses, Stopped submissions, Rows in the table) and the grid of submissions.
- **Channel poll.** In a channel composer, type `/poll`, enter a question and two options, then activate **Post poll**. Result: a poll card in the message; a vote is one click on an option.

## Gotchas

- With `enable-forms` off, `/app/form/<id>` opens the respond view with no builder and no Create entry; a builder check will look like a missing feature.
- A form is created **closed and members-only** by the AI tool; a respondent link alone does not mean the form accepts responses.
- Anonymous respondents cannot edit their answer; signed-in respondents can while the form is open.
- The **Submitted** and **Respondent** columns in the linked table are protected and cannot be deleted while the form exists.
- Deleting a question keeps its response column and existing answers. Deleting the form's table warns which forms it removes.
- Gates are sent to respondents' browsers; do not put confidential criteria in a gate rule.
- Preview is blocked from creating bookings: its booking button is disabled.
- Layout edits in the builder collaborate live; a connection failure is shown, but there is no "saved" badge.
- Each form has at most one form per table; creating over an existing table needs Owner access on that database.
- Channel posting a form grants that channel the View role, so channel members can respond.
