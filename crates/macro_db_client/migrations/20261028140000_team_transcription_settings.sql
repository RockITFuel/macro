-- A team's transcription settings, edited by its owners and admins in
-- Settings > Team > Transcription (crates/transcription_settings). A NULL
-- column means "use the server env default", so stacks configured through env
-- keep working. Secrets (hub token, OpenAI key) never live here. Deleting the
-- team deletes its settings.
CREATE TABLE team_transcription_settings (
    team_id UUID PRIMARY KEY REFERENCES team (id) ON DELETE CASCADE,
    enabled BOOLEAN,
    provider TEXT CHECK (provider IN ('local', 'cloud')),
    hub_url TEXT,
    model TEXT CHECK (model IN ('parakeet', 'whisper')),
    language TEXT CHECK (language ~ '^[a-z]{2}$'),
    updated_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
