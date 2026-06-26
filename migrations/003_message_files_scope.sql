-- message_files previously had no row_policy, so attachment metadata
-- (file_id, file_name) for messages in restricted (role/custom) channels was
-- readable by every household member via direct api/db — and the raw file then
-- fetchable by id. Give it the same channel_scoped protection as messages by
-- denormalizing the owning channel and uploader onto each file row so the
-- policy can verify channel membership (read/insert) and uploader (update/delete).
ALTER TABLE app_group_channels__message_files ADD COLUMN channel_id TEXT NOT NULL DEFAULT '';
ALTER TABLE app_group_channels__message_files ADD COLUMN author_id  TEXT NOT NULL DEFAULT '';

-- Backfill existing rows from their parent message.
UPDATE app_group_channels__message_files
SET channel_id = (
      SELECT m.channel_id FROM app_group_channels__messages m
      WHERE m.id = app_group_channels__message_files.message_id
    ),
    author_id = (
      SELECT m.author_id FROM app_group_channels__messages m
      WHERE m.id = app_group_channels__message_files.message_id
    )
WHERE channel_id = '' OR author_id = '';

CREATE INDEX IF NOT EXISTS message_files_channel_idx
  ON app_group_channels__message_files (channel_id);
