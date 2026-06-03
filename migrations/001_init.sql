CREATE TABLE IF NOT EXISTS channels (
  household_id     UUID NOT NULL DEFAULT current_setting('app.household_id', true)::uuid,
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
  PRIMARY KEY (household_id, id),
  UNIQUE (household_id, slug)
);

CREATE TABLE IF NOT EXISTS channel_members (
  household_id UUID NOT NULL DEFAULT current_setting('app.household_id', true)::uuid,
  channel_id   TEXT NOT NULL,
  member_id    TEXT NOT NULL,
  PRIMARY KEY (household_id, channel_id, member_id)
);

CREATE TABLE IF NOT EXISTS messages (
  household_id UUID NOT NULL DEFAULT current_setting('app.household_id', true)::uuid,
  id           TEXT NOT NULL,
  channel_id   TEXT NOT NULL,
  author_id    TEXT NOT NULL,
  author_name  TEXT NOT NULL,
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  edited_at    TEXT,
  PRIMARY KEY (household_id, id)
);

CREATE INDEX IF NOT EXISTS messages_channel_idx ON messages (household_id, channel_id, created_at);

CREATE TABLE IF NOT EXISTS message_files (
  household_id UUID NOT NULL DEFAULT current_setting('app.household_id', true)::uuid,
  id           TEXT NOT NULL,
  message_id   TEXT NOT NULL,
  file_id      TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  mime_type    TEXT NOT NULL DEFAULT '',
  size_bytes   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (household_id, id)
);

CREATE TABLE IF NOT EXISTS channel_subscriptions (
  household_id UUID NOT NULL DEFAULT current_setting('app.household_id', true)::uuid,
  channel_id   TEXT NOT NULL,
  member_id    TEXT NOT NULL,
  PRIMARY KEY (household_id, channel_id, member_id)
);

CREATE TABLE IF NOT EXISTS member_last_read (
  household_id UUID NOT NULL DEFAULT current_setting('app.household_id', true)::uuid,
  channel_id   TEXT NOT NULL,
  member_id    TEXT NOT NULL,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (household_id, channel_id, member_id)
);
