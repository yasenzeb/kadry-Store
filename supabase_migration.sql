-- ══════════════════════════════════════════════
-- ELBNA STORE — Supabase Migration
-- Run this in Supabase SQL Editor
-- ══════════════════════════════════════════════

-- 1. Add discount columns to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS discount_type  TEXT    NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC NOT NULL DEFAULT 0;

-- 2. Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Seed default categories
INSERT INTO categories (name, slug)
VALUES
  ('ساعات ذكية', 'watches'),
  ('سماعات',     'headphones'),
  ('باور بانك',  'powerbank'),
  ('إكسسوارات',  'accessories')
ON CONFLICT (slug) DO NOTHING;

-- 4. Enable Row Level Security
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Allow public read
CREATE POLICY IF NOT EXISTS "categories_select_public"
  ON categories FOR SELECT USING (true);
