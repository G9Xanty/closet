import { supabase as _supabase } from "../lib/supabase";
const supabase = _supabase!;

const API_BASE = window.location.origin;

export async function api(path: string, options?: RequestInit) {
  const isFormData = options?.body instanceof FormData;
  console.log("[API REQUEST]", path, options?.method || "GET");

  const token = (await supabase.auth.getSession().then(s => s.data.session?.access_token).catch(() => undefined)) || "";

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
