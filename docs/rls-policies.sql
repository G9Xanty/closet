-- =============================================================
--  COMPREHENSIVE RLS POLICIES FOR CLOSET ELANDER
--  Ejecutar en el SQL Editor de Supabase (Dashboard > SQL Editor)
-- =============================================================

-- =============================================================
--  1. PROFILES TABLE
-- =============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Usuario puede leer su propio perfil completo
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Cualquier usuario autenticado puede ver perfiles públicos
CREATE POLICY "Authenticated users can view profiles"
  ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- Cualquier persona puede ver datos públicos básicos
-- (para vistas de producto, perfil de vendedor, etc.)
CREATE POLICY "Anyone can view public profile data"
  ON profiles FOR SELECT
  USING (true);

-- Usuario puede actualizar su propio perfil
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Usuario puede insertar su propio perfil (al registrarse)
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Solo admin puede eliminar perfiles
CREATE POLICY "Only admins can delete profiles"
  ON profiles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND raw_user_meta_data->>'is_admin' = 'true'
    )
  );

-- =============================================================
--  2. PRODUCTS TABLE
-- =============================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Cualquier persona puede ver productos disponibles
CREATE POLICY "Anyone can view available products"
  ON products FOR SELECT
  USING (true);

-- Usuarios autenticados pueden crear productos
CREATE POLICY "Authenticated users can create products"
  ON products FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND auth.uid() = user_id
  );

-- Dueño o admin puede actualizar producto
CREATE POLICY "Owner or admin can update product"
  ON products FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND raw_user_meta_data->>'is_admin' = 'true'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND raw_user_meta_data->>'is_admin' = 'true'
    )
  );

-- Dueño o admin puede eliminar producto
CREATE POLICY "Owner or admin can delete product"
  ON products FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND raw_user_meta_data->>'is_admin' = 'true'
    )
  );

-- =============================================================
--  3. STORAGE (product-images bucket)
-- =============================================================

-- NOTA: Crear bucket primero si no existe:
-- INSERT INTO storage.buckets (id, name, public, avif_autodetection)
-- VALUES ('product-images', 'product-images', true, false)
-- ON CONFLICT (id) DO NOTHING;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Cualquier persona puede leer imágenes (son públicas para el feed)
CREATE POLICY "Anyone can view product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- Usuarios autenticados pueden subir imágenes
-- Los archivos se suben a la raíz del bucket con prefijo user-{uid}-
CREATE POLICY "Authenticated users can upload product images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
    AND name LIKE 'user-' || auth.uid() || '-%'
  );

-- Dueño puede actualizar sus imágenes
CREATE POLICY "Owner can update own product images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
    AND owner = auth.uid()
  );

-- Dueño o admin puede eliminar imágenes
CREATE POLICY "Owner or admin can delete product images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'product-images'
    AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM auth.users
        WHERE id = auth.uid()
          AND raw_user_meta_data->>'is_admin' = 'true'
      )
    )
  );

-- =============================================================
--  4. FAVORITES TABLE (si se implementa)
-- =============================================================
-- ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "Users can view own favorites"
--   ON favorites FOR SELECT
--   USING (auth.uid() = user_id);
--
-- CREATE POLICY "Users can add favorites"
--   ON favorites FOR INSERT
--   WITH CHECK (auth.uid() = user_id);
--
-- CREATE POLICY "Users can remove own favorites"
--   ON favorites FOR DELETE
--   USING (auth.uid() = user_id);

-- =============================================================
--  5. AUTO-CREATE PROFILE ON SIGNUP (trigger)
-- =============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', NEW.raw_user_meta_data->>'dealer_id', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar', 'avatar-1')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================
--  6. VERIFICACIÓN: Listar políticas activas
-- =============================================================
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
