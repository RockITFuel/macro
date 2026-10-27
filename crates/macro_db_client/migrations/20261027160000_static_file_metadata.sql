-- Static file metadata in Postgres, for stacks whose DynamoDB is LocalStack
-- (local and self-hosted): LocalStack keeps it in memory, so a restart lost
-- every file's owner and upload state. Mirrors the DynamoDB item.
CREATE TABLE static_file_metadata (
    file_id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    content_type TEXT NOT NULL,
    is_uploaded BOOLEAN NOT NULL DEFAULT false,
    last_accessed TIMESTAMPTZ NOT NULL DEFAULT now(),
    extension_data JSONB,
    file_name TEXT NOT NULL,
    s3_key TEXT NOT NULL
);
