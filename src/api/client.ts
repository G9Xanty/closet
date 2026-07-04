import { supabase as _supabase } from "../lib/supabase";
const supabase = _supabase!;

const API_BASE = window.location.origin;

export async function api(path: string, options?: RequestInit) {
  const isFormData = options?.body instanceof FormData;
  const method = options?.method || "GET";
  console.log("[API REQUEST]", path, method);

  const session = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const token = session.data.session?.access_token || "";
  if (!token && method !== "GET") console.warn("[API] No hay token para", method, path);

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      "X-Requested-With": "XMLHttpRequest",
      ...(options?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error de servidor.");
  console.log("[API RESPONSE]", path, { ok: true, productCount: data.products?.length });
  return data;
}
