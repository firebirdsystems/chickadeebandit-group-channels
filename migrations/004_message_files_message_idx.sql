-- Attachments are fetched with `WHERE message_id IN (...)` (index.html loadMessages),
-- but the only existing index on message_files is on channel_id, so that lookup
-- scanned the table. Index message_id so attachment fetches stay fast at scale.
CREATE INDEX IF NOT EXISTS message_files_message_idx
  ON app_group_channels__message_files (message_id);
