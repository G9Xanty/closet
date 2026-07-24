import axios from "axios";
import { supabase as _supabase } from "../lib/supabase";
const supabase = _supabase!;

const apiClient = axios.create({
  baseURL: "",
  timeout: 30000,
  withCredentials: true,
});

let refreshing: Promise<string | null> | null = null;

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;
  return null;
}

async function tryRefresh(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.refreshSession();
        return session?.access_token || null;
      } catch {
        return null;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await getAccessToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch {}
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }
    originalRequest._retry = true;

    const newToken = await tryRefresh();
    if (newToken) {
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(originalRequest);
    }

    return Promise.reject(error);
  }
);

export async function api(path: string, options?: RequestInit) {
  const method = (options?.method || "GET").toUpperCase();
  const isFormData = options?.body instanceof FormData;

  let data: unknown = undefined;
  if (options?.body) {
    if (isFormData) {
      data = options.body;
    } else if (typeof options.body === "string") {
      try {
        data = JSON.parse(options.body);
      } catch {
        data = options.body;
      }
    }
  }

  const headers: Record<string, string> = {
    "X-Requested-With": "XMLHttpRequest",
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
  };

  if (options?.headers) {
    const h = new Headers(options.headers);
    h.forEach((v, k) => {
      if (k.toLowerCase() !== "authorization") headers[k] = v;
    });
  }

  const res = await apiClient({
    url: path,
    method: method.toLowerCase(),
    data,
    headers,
  });

  return res.data;
}
