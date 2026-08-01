CREATE TABLE IF NOT EXISTS app_group_channels__channels (
  id               TEXT NOT NULL,
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  membership_type  TEXT NOT NULL DEFAULT 'all',
  membership_roles TEXT NOT NULL DEFAULT '[]',
  is_system        INTEGER NOT NULL DEFAULT 0,
  created_by       TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL,
  archived_at      TEXT,
  PRIMARY KEY (id),
  -- `slug` must stay in db_plaintext_columns: it is derived from `name` (already
  -- plaintext), and this UNIQUE is the one-channel-per-name guarantee. Encrypted,
  -- every write stores a fresh random IV, so two channels named the same never
  -- collide and the constraint silently guaranteed nothing.
  UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS app_group_channels__channel_members (
  channel_id   TEXT NOT NULL,
  member_id    TEXT NOT NULL,
  PRIMARY KEY (channel_id, member_id)
);

CREATE TABLE IF NOT EXISTS app_group_channels__messages (
  id           TEXT NOT NULL,
  channel_id   TEXT NOT NULL,
  author_id    TEXT NOT NULL,
  author_name  TEXT NOT NULL,
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  edited_at    TEXT,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS messages_channel_idx ON app_group_channels__messages (channel_id, created_at);

CREATE TABLE IF NOT EXISTS app_group_channels__message_files (
  id           TEXT NOT NULL,
  message_id   TEXT NOT NULL,
  file_id      TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  mime_type    TEXT NOT NULL DEFAULT '',
  size_bytes   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS app_group_channels__channel_subscriptions (
  channel_id   TEXT NOT NULL,
  member_id    TEXT NOT NULL,
  PRIMARY KEY (channel_id, member_id)
);

CREATE TABLE IF NOT EXISTS app_group_channels__member_last_read (
  channel_id   TEXT NOT NULL,
  member_id    TEXT NOT NULL,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, member_id)
);
