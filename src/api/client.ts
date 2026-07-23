import axios from "axios";
import { supabase as _supabase } from "../lib/supabase";
const supabase = _supabase!;

const apiClient = axios.create({
  baseURL: "",
  timeout: 30000,
  withCredentials: true,
});

apiClient.interceptors.request.use(
  async (config) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      }
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
    try {
      const {
        data: { session },
        error: refreshError,
      } = await supabase.auth.refreshSession();
      if (refreshError || !session) {
        await supabase.auth.signOut();
        window.dispatchEvent(new CustomEvent("auth:logout"));
        return Promise.reject(error);
      }
      originalRequest.headers.Authorization = `Bearer ${session.access_token}`;
      return apiClient(originalRequest);
    } catch {
      await supabase.auth.signOut();
      window.dispatchEvent(new CustomEvent("auth:logout"));
      return Promise.reject(error);
    }
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
