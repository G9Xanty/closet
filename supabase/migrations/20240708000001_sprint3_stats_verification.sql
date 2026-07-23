-- ============================================
-- SPRINT 3: Sistema de estadísticas y verificación
-- ============================================

-- 1. Extender profiles con estadísticas
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_products_published INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_products_sold INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_products_bought INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_level TEXT DEFAULT 'none'
  CHECK (verification_level IN ('none','bronze','silver','gold'));

-- 2. Extender products con campos de venta
ALTER TABLE products ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Tabla de verificación de ventas
CREATE TABLE IF NOT EXISTS product_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','submitted','verified','rejected','disputed')),
  evidence_url TEXT,
  evidence_type TEXT CHECK (evidence_type IN ('photo','video','receipt')),
  seller_notes TEXT,
  buyer_confirmed BOOLEAN DEFAULT false,
  buyer_confirmed_at TIMESTAMPTZ,
  admin_reviewed BOOLEAN DEFAULT false,
  admin_id UUID REFERENCES auth.users(id),
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id)
);
CREATE INDEX IF NOT EXISTS idx_verifications_product ON product_verifications(product_id);
CREATE INDEX IF NOT EXISTS idx_verifications_seller ON product_verifications(seller_id);
CREATE INDEX IF NOT EXISTS idx_verifications_status ON product_verifications(status);
ALTER TABLE product_verifications ENABLE ROW LEVEL SECURITY;

-- RLS: participants can read
DROP POLICY IF EXISTS "verifications_select_participants" ON product_verifications;
CREATE POLICY "verifications_select_participants" ON product_verifications
  FOR SELECT USING (
    auth.uid() = seller_id OR auth.uid() = buyer_id OR auth.uid() = admin_id
  );

-- RLS: seller can insert/update own verification
DROP POLICY IF EXISTS "verifications_insert_seller" ON product_verifications;
CREATE POLICY "verifications_insert_seller" ON product_verifications
  FOR INSERT WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "verifications_update_participants" ON product_verifications;
CREATE POLICY "verifications_update_participants" ON product_verifications
  FOR UPDATE USING (
    auth.uid() = seller_id OR auth.uid() = buyer_id
  );

-- 4. Función para actualizar estadísticas del perfil
CREATE OR REPLACE FUNCTION update_profile_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update published count
  UPDATE profiles SET total_products_published = (
    SELECT COUNT(*) FROM products WHERE user_id = NEW.user_id
  ) WHERE id = NEW.user_id;

  -- Update sold count (only verified)
  IF NEW.status = 'sold' THEN
    UPDATE profiles SET total_products_sold = (
      SELECT COUNT(*) FROM products
      WHERE user_id = NEW.user_id AND status = 'sold'
        AND EXISTS (SELECT 1 FROM product_verifications WHERE product_id = products.id AND status = 'verified')
    ) WHERE id = NEW.user_id;
  END IF;

  -- Update buyer's bought count
  IF NEW.buyer_id IS NOT NULL AND NEW.status = 'sold' THEN
    UPDATE profiles SET total_products_bought = (
      SELECT COUNT(*) FROM products
      WHERE buyer_id = NEW.buyer_id AND status = 'sold'
        AND EXISTS (SELECT 1 FROM product_verifications WHERE product_id = products.id AND status = 'verified')
    ) WHERE id = NEW.buyer_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on products changes
DROP TRIGGER IF EXISTS trigger_update_profile_stats ON products;
CREATE TRIGGER trigger_update_profile_stats
  AFTER INSERT OR UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_profile_stats();

-- 5. Función para actualizar estadísticas cuando se verifica una venta
CREATE OR REPLACE FUNCTION update_stats_on_verification()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'verified' AND (OLD.status IS NULL OR OLD.status != 'verified') THEN
    -- Update seller's sold count
    UPDATE profiles SET total_products_sold = (
      SELECT COUNT(*) FROM products
      WHERE user_id = NEW.seller_id AND status = 'sold'
        AND EXISTS (SELECT 1 FROM product_verifications WHERE product_id = products.id AND status = 'verified')
    ) WHERE id = NEW.seller_id;

    -- Update buyer's bought count
    IF NEW.buyer_id IS NOT NULL THEN
      UPDATE profiles SET total_products_bought = (
        SELECT COUNT(*) FROM products
        WHERE buyer_id = NEW.buyer_id AND status = 'sold'
          AND EXISTS (SELECT 1 FROM product_verifications WHERE product_id = products.id AND status = 'verified')
      ) WHERE id = NEW.buyer_id;
    END IF;

    -- Update verification level based on total verified sales
    UPDATE profiles SET verification_level = CASE
      WHEN (
        SELECT COUNT(*) FROM product_verifications
        WHERE seller_id = NEW.seller_id AND status = 'verified'
      ) >= 10 THEN 'gold'
      WHEN (
        SELECT COUNT(*) FROM product_verifications
        WHERE seller_id = NEW.seller_id AND status = 'verified'
      ) >= 5 THEN 'silver'
      WHEN (
        SELECT COUNT(*) FROM product_verifications
        WHERE seller_id = NEW.seller_id AND status = 'verified'
      ) >= 1 THEN 'bronze'
      ELSE 'none'
    END WHERE id = NEW.seller_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on verifications changes
DROP TRIGGER IF EXISTS trigger_update_stats_on_verification ON product_verifications;
CREATE TRIGGER trigger_update_stats_on_verification
  AFTER INSERT OR UPDATE ON product_verifications
  FOR EACH ROW
  EXECUTE FUNCTION update_stats_on_verification();
