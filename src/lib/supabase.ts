import { createClient } from "@supabase/supabase-js";

console.log("[SUPABASE INIT]");
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
console.log("[SUPABASE URL]", SUPABASE_URL);
console.log("[SUPABASE KEY EXISTS]", !!SUPABASE_ANON_KEY);

let supabaseClient: ReturnType<typeof createClient> | null = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("[SUPABASE] client created");
} else {
  console.error(
    "[SUPABASE] Not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env"
  );
}

export { supabaseClient as supabase };
export function isSupabaseReady(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
}
