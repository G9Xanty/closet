-- ============================================
-- CLOSET ELANDER — Migration: Create products
-- ============================================

CREATE TABLE IF NOT EXISTS products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  price NUMERIC NOT NULL DEFAULT 0,
  category TEXT DEFAULT 'otros',
  size TEXT DEFAULT '',
  brand TEXT DEFAULT '',
  condition TEXT DEFAULT 'good',
  status TEXT DEFAULT 'disponible',
  uber_flash_included BOOLEAN DEFAULT false,
  image_url TEXT DEFAULT '',
  image_url_2 TEXT DEFAULT '',
  image_url_3 TEXT DEFAULT '',
  image_url_4 TEXT DEFAULT '',
  images JSONB DEFAULT '[]'::jsonb,
  storage_path TEXT DEFAULT '',
  storage_paths JSONB DEFAULT '[]'::jsonb,
  seller_phone TEXT DEFAULT '',
  show_phone BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK if table already existed without it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_user_id_fkey'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_status ON products (status);
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products (user_id);

-- RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Read: public
DROP POLICY IF EXISTS "products_select_public" ON products;
CREATE POLICY "products_select_public" ON products
  FOR SELECT USING (true);

-- Insert: owner only
DROP POLICY IF EXISTS "products_insert_owner" ON products;
CREATE POLICY "products_insert_owner" ON products
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Update: owner only
DROP POLICY IF EXISTS "products_update_owner" ON products;
CREATE POLICY "products_update_owner" ON products
  FOR UPDATE USING (auth.uid() = user_id);

-- Delete: owner only
DROP POLICY IF EXISTS "products_delete_owner" ON products;
CREATE POLICY "products_delete_owner" ON products
  FOR DELETE USING (auth.uid() = user_id);
