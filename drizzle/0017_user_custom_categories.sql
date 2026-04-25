-- Custom calendar contexts (per-user)
-- Previously stored only in browser localStorage (`lumina_custom_categories`),
-- which leaked across user switches. Now backed by users.custom_categories
-- and hydrated via /api/users/preferences.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "custom_categories" jsonb DEFAULT '[]'::jsonb;
