-- ============================================
-- CLOSET ELANDER — Full Schema Migration
-- Safe to re-run (all IF NOT EXISTS / IF NOT)
-- ============================================

-- 1. Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT DEFAULT '',
  name TEXT DEFAULT '',
  profile_photo TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  location TEXT DEFAULT '',
  phone_number TEXT DEFAULT '',
  whatsapp_enabled BOOLEAN DEFAULT false,
  phone_private BOOLEAN DEFAULT true,
  avatar TEXT DEFAULT 'avatar-1',
  reputation_score INTEGER DEFAULT 0,
  sales_verified INTEGER DEFAULT 0,
  sales_external INTEGER DEFAULT 0,
  reports_count INTEGER DEFAULT 0,
  admin_rating INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username ON profiles (username) WHERE username != '';
CREATE INDEX IF NOT EXISTS idx_profiles_reputation ON profiles (reputation_score DESC);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reputation_score INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sales_verified INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sales_external INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reports_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_rating INTEGER DEFAULT 0;

-- 2. Products (before sales/reports which FK to it)
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
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_status ON products (status);
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products (user_id);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_select_public" ON products;
CREATE POLICY "products_select_public" ON products FOR SELECT USING (true);
DROP POLICY IF EXISTS "products_insert_owner" ON products;
CREATE POLICY "products_insert_owner" ON products FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "products_update_owner" ON products;
CREATE POLICY "products_update_owner" ON products FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "products_delete_owner" ON products;
CREATE POLICY "products_delete_owner" ON products FOR DELETE USING (auth.uid() = user_id);

-- 3. Sales
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','requested','confirmed','rejected','completed','external')),
  type TEXT NOT NULL DEFAULT 'internal'
    CHECK (type IN ('internal','external')),
  verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sales_seller ON sales (seller_id);
CREATE INDEX IF NOT EXISTS idx_sales_buyer ON sales (buyer_id);
CREATE INDEX IF NOT EXISTS idx_sales_product ON sales (product_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status);
CREATE INDEX IF NOT EXISTS idx_sales_verified ON sales (verified) WHERE verified = true;

-- 4. Reputation events
CREATE TABLE IF NOT EXISTS reputation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'sale_verified','sale_external','admin_boost','fraud_flag','report_resolved','report_confirmed'
    )),
  points INTEGER NOT NULL DEFAULT 0,
  reference_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reputation_user ON reputation_events (user_id);
CREATE INDEX IF NOT EXISTS idx_reputation_created ON reputation_events (created_at DESC);

-- 5. Reports
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  reason TEXT NOT NULL
    CHECK (reason IN ('fraud','spam','inappropriate','fake_product','other')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','reviewed','dismissed','action_taken')),
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports (reported_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);

-- 6. Admin audit log
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_id TEXT,
  ip TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_log (admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log (created_at DESC);
