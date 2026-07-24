import { useEffect, useState, useCallback } from "react";
import { supabase as _supabase } from "../lib/supabase";
const supabase = _supabase!;
import type { User } from "@supabase/supabase-js";
export interface AppUser {
  id: string;
  email: string;
  username: string;
  dealer_id: string;
  avatar: string;
  name?: string;
  profile_photo?: string;
  bio?: string;
  location?: string;
  phone_number?: string;
  whatsapp_enabled?: boolean;
  phone_private?: boolean;
  is_admin?: boolean;
  banned?: boolean;
  email_confirmed?: boolean;
}

function parseUser(supabaseUser: User): AppUser | null {
  if (!supabaseUser) return null;
  const meta = supabaseUser.user_metadata || {};
  return {
    id: supabaseUser.id,
    email: supabaseUser.email || "",
    username: meta.username || meta.dealer_id || "",
    dealer_id: meta.dealer_id || "",
    avatar: meta.avatar || "avatar-1",
    is_admin: Boolean(meta.is_admin),
    banned: Boolean(meta.banned),
    email_confirmed: Boolean(supabaseUser.email_confirmed_at),
  };
}

export function useAuth() {
  const [session, setSession] = useState<boolean | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  console.log("[AUTH INIT]", { supabase: !!supabase });

  useEffect(() => {
    let cancelled = false;
    let timedOut = false;
    let resolved = false;

    console.log("[AUTH] useEffect start");

    function finish(s: boolean | null, u: AppUser | null) {
      if (cancelled || resolved) return;
      resolved = true;
      setSession(s);
      setUser(u);
      setLoading(false);
      console.log("[AUTH] finish", { session: s, user: u?.email });
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      console.warn("[AUTH] getSession timed out after 8s");
      finish(false, null);
    }, 8000);

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (cancelled || timedOut) return;
      clearTimeout(timeout);
      if (s?.user) {
        const u = parseUser(s.user);
        cleanAuthHash();
        finish(true, u);
      } else {
        finish(false, null);
      }
    }).catch((err) => {
      console.error("[AUTH] getSession error", err);
      if (!cancelled) {
        clearTimeout(timeout);
        finish(false, null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (cancelled) return;
      console.log("[AUTH] onAuthStateChange", event);
      switch (event) {
        case "SIGNED_IN":
        case "TOKEN_REFRESHED":
          if (s?.user) {
            setUser(parseUser(s.user));
            setSession(true);
          }
          break;
        case "SIGNED_OUT":
          setUser(null);
          setSession(false);
          break;
        case "USER_UPDATED":
          if (s?.user) {
            setUser(parseUser(s.user));
          }
          break;
        case "PASSWORD_RECOVERY":
          if (s?.user) {
            setUser(parseUser(s.user));
            setSession(true);
          }
          break;
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  function cleanAuthHash() {
    try {
      const hash = window.location.hash;
      if (!hash) return;
      const params = new URLSearchParams(hash.replace("#", "?"));
      const type = params.get("type");
      if (type === "signup" || type === "invite" || type === "recovery") {
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch {}
  }

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          dealer_id: "",
          username: "",
          avatar: "avatar-1",
          is_admin: false,
          banned: false,
          whatsapp_phone: "",
        },
      },
    });
    if (error) throw error;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      if (error.message.includes("Email not confirmed")) {
        throw new Error("EMAIL_NOT_CONFIRMED");
      }
      throw error;
    }
    if (!data.user?.email_confirmed_at) {
      await supabase.auth.signOut();
      throw new Error("EMAIL_NOT_CONFIRMED");
    }
    try {
      const token = data.session?.access_token;
      if (token) {
        await fetch(`/api/auth/sync`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "X-Requested-With": "XMLHttpRequest" }
        });
      }
    } catch {} // sync best-effort
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    setSession(false);
    await supabase.auth.signOut();
    await fetch(`${window.location.origin}/api/auth/logout`, { method: "POST" }).catch(() => {});
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: window.location.origin }
    );
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    if (newPassword.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }, []);

  const updateProfile = useCallback(async (data: { username: string; whatsapp_phone?: string; avatar?: string }) => {
    if (!data.username || data.username.trim().length < 3) {
      throw new Error("El username debe tener al menos 3 caracteres");
    }
    const { error } = await supabase.auth.updateUser({
      data: {
        username: data.username.trim(),
        dealer_id: data.username.trim(),
        avatar: data.avatar || "avatar-1",
        whatsapp_phone: data.whatsapp_phone || "",
      },
    });
    if (error) throw error;
  }, []);

  return {
    session,
    user,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    updateProfile,
  };
}
