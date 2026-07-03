-- =============================================================
--  PROFILES TABLE + BASIC RLS
--  Para RLS completo de todas las tablas, ver rls-policies.sql
-- =============================================================

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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index on non-empty usernames only
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username
  ON profiles (username) WHERE username != '';

-- Ver rls-policies.sql para todas las políticas RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Trigger to auto-create profile on user signup
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
