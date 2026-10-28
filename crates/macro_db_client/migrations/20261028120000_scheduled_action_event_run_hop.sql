-- Bot hand-offs between the last human action and this run: 0 when a person
-- caused the triggering event, n + 1 when work at hop n did.
ALTER TABLE scheduled_action_event_run
    ADD COLUMN hop SMALLINT NOT NULL DEFAULT 0 CHECK (hop >= 0);

CREATE INDEX scheduled_action_event_run_bot_caused_idx
    ON scheduled_action_event_run (action_id, admitted_at) WHERE hop > 0;
