CREATE TABLE IF NOT EXISTS notes (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  topic_zh TEXT NOT NULL,
  topic_en TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  mdx_content TEXT NOT NULL,
  source_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes (updated_at DESC);
