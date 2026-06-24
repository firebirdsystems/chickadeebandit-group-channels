CREATE TABLE IF NOT EXISTS app_group_channels__settings (
  key   TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE app_group_channels__channels ADD COLUMN visibility TEXT NOT NULL DEFAULT 'all'
