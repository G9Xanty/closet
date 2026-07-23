import { supabase as _supabase } from "../lib/supabase";
const supabase = _supabase!;

export async function clearAuthAndReload() {
  console.log("[CLEAR] Limpiando autenticacion...");
  try {
    await supabase.auth.signOut();
    localStorage.clear();
    console.log("[CLEAR] Limpieza completada");
    window.location.reload();
  } catch (error) {
    console.error("[CLEAR] Error:", error);
  }
}
