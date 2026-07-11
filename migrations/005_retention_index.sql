CREATE INDEX IF NOT EXISTS app_group_channels__messages_retention_idx
  ON app_group_channels__messages (created_at, id);
