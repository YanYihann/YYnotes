CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  folder_id BIGINT,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  topic_zh TEXT NOT NULL,
  topic_en TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  mdx_content TEXT NOT NULL,
  source_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, slug)
);

CREATE TABLE IF NOT EXISTS folders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

ALTER TABLE notes ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS folder_id BIGINT;
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_slug_key;
DO $$
BEGIN
  ALTER TABLE notes
    ADD CONSTRAINT notes_folder_fk
    FOREIGN KEY (folder_id)
    REFERENCES folders (id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS notes_user_slug_unique_idx ON notes (user_id, slug);
CREATE INDEX IF NOT EXISTS notes_user_updated_idx ON notes (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS notes_user_folder_idx ON notes (user_id, folder_id);
CREATE INDEX IF NOT EXISTS folders_user_order_idx ON folders (user_id, sort_order ASC, updated_at DESC);
