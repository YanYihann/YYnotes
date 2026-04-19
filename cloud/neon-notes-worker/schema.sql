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

ALTER TABLE notes ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS notes_user_slug_unique_idx ON notes (user_id, slug);
CREATE INDEX IF NOT EXISTS notes_user_updated_idx ON notes (user_id, updated_at DESC);
