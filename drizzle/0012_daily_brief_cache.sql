-- Daily brief cache: stores Gemini-generated narrative per user per day
-- UNIQUE(user_id, date) enforces max one narrative per user per day

CREATE TABLE IF NOT EXISTS daily_brief_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  narrative TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS "daily_brief_cache_user_id_idx" ON daily_brief_cache (user_id);
