import { supabase as _supabase } from "../lib/supabase";
const supabase = _supabase!;

export async function diagnoseAuth() {
  console.log("=== DIAGNOSTICO DE AUTENTICACION ===");

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    console.log("[DIAG] No hay sesion activa");
    return;
  }

  console.log("[DIAG] Sesion activa");
  console.log("[DIAG] Usuario:", session.user.email);
  const expSec = Math.round(
    (session.expires_at! * 1000 - Date.now()) / 1000
  );
  console.log("[DIAG] Token expira en:", expSec, "segundos");
  console.log("[DIAG] Token:", session.access_token.substring(0, 30) + "...");

  try {
    const response = await fetch("/api/profiles/me", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (response.ok) {
      const data = await response.json();
      console.log("[DIAG] Backend OK:", data);
    } else {
      console.log("[DIAG] Backend fallo:", response.status);
      const text = await response.text();
      console.log("[DIAG] Respuesta:", text);
    }
  } catch (err) {
    console.error("[DIAG] Error backend:", err);
  }
}
