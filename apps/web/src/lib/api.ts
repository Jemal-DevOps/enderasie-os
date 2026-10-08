import { auth } from "./auth";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = auth.getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}