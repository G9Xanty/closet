-- ============================================
-- CLOSET ELANDER — MIGRATION: Trust System
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Extend profiles with reputation fields
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS reputation_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_verified INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_external INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reports_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_rating INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_reputation ON profiles (reputation_score DESC);

-- 2. Sales table
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

-- 3. Reputation events (immutable log)
CREATE TABLE IF NOT EXISTS reputation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'sale_verified',
      'sale_external',
      'admin_boost',
      'fraud_flag',
      'report_resolved',
      'report_confirmed'
    )),
  points INTEGER NOT NULL DEFAULT 0,
  reference_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reputation_user ON reputation_events (user_id);
CREATE INDEX IF NOT EXISTS idx_reputation_created ON reputation_events (created_at DESC);

-- 4. Reports
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
