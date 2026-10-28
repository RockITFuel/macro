# Routines

Routines are scheduled AI tasks. A user writes a prompt, picks an agent or model, sets a schedule or trigger, and the routine runs on its own. Each run is its own agent session or chat. The user can pause a routine, run it now, see its run history, and open each run's conversation.

## Sub-features

- `routine-list` lists routines with Created by, Status, Runs with and Enabled columns.
- `routine-create` creates a routine from a prompt, a target agent or model, and a schedule or trigger.
- `routine-edit` edits the prompt, target, schedule, sources and triggers; edits save automatically.
- `routine-enable` pauses or resumes a routine from its Enabled checkbox.
- `routine-run-now` starts a run immediately.
- `routine-history` lists past runs, each opening its session or chat, with Run unavailable for missing runs.
- `routine-run-visibility` shows or hides a routine's runs in the Agents sidebar.

## How to get to it (user POV)

- Agents → Routines opens the list at `/app/routines`.
- Create Routine on that list, or the Create menu (`Routine`), or `/app/routines/new`.
- Click a routine row to open its settings at `/app/routines/<id>` within the Agents workspace.
- Routine settings' Run History tab lists the runs.
- Mobile: Settings → Routines; `/app/routines` opens the list directly.
- Legacy links `/app/automation/<id>` open the same routine.

## Driving it with chrome-devtools MCP

Preconditions:

- Macro web app is running and signed in as a test user with the agents flag on.
- Use a throwaway routine name; delete it during cleanup. A run uses AI usage.

- **Open the list.** Navigate to `/app/routines`. Take a snapshot. Observable: a list with columns Created by, Status, Runs with, Enabled.
- **Create.** Click `Create Routine`. Observable: the composer modal opens with a name field and a prompt editor.
- **Fill and save.** Click the name textbox, `type_text` a name, click the prompt editor, `type_text` a short prompt. Pick a schedule under the schedule control. Save with the modal's save control (label unverified). Observable: the routine row appears in the list.
- **Pause.** In the list, uncheck the `Enabled` checkbox on the row. Observable: Status changes to paused.
- **Run now.** Open the routine and use its run control (the run button component exists; its label is unverified). Observable: a new entry appears in Run History with a pending state.
- **Open a run.** Click the run row. Observable: the run's agent session or chat opens; URL is `/app/agents/<id>` or `/app/chat/<id>`.
- **Proof.** Save snapshots of the list and the run history; record the run count before and after.

## Gotchas

- Routine targets do not save an effort setting; the model picker offers only the model.
- A run of a routine set to Hide runs is hidden from the Agents sidebar until the clock toggle is pressed.
- Changing a routine's execution target does not change links for older runs.
- A deleted or inaccessible run shows Run unavailable with no link, including failed preparations that created no resource.
- Scheduled delivery of results by email uses the Gmail or Outlook integration; other delivery targets are later.
- Schedules are time-based and run without the user present; verify the schedule's next run time rather than waiting for it in a browser proof.
