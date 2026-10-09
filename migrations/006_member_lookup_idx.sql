-- The two per-member reads every open makes (index.html loadSubscriptions and
-- loadLastRead) filter on `member_id` alone, but both tables are keyed
-- (channel_id, member_id), so that lookup scanned the table. Index member_id so
-- the reads seek, and so manifest.preload may declare them.
CREATE INDEX IF NOT EXISTS app_group_channels__channel_subscriptions_member_idx
  ON app_group_channels__channel_subscriptions (member_id);
CREATE INDEX IF NOT EXISTS app_group_channels__member_last_read_member_idx
  ON app_group_channels__member_last_read (member_id);
