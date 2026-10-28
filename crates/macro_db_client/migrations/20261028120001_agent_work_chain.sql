-- Bot work (a routine run, or a session a bot mention started) and the window
-- in which it may act. Activity by that bot for that user inside the window
-- descends from it, which bounds chains of bots triggering bots. Rows are only
-- useful for a short while; inserts prune a pair's rows older than a day.
CREATE TABLE agent_work_chain (
    id UUID PRIMARY KEY,
    bot_id UUID NOT NULL,
    user_id TEXT NOT NULL,
    hop SMALLINT NOT NULL CHECK (hop >= 0),
    routine_id UUID,
    started_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at >= started_at)
);

CREATE INDEX agent_work_chain_actor_idx ON agent_work_chain (user_id, bot_id, ends_at);
