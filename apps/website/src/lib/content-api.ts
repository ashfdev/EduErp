const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function fetchContent<T>(path: string, params?: Record<string, string>): Promise<T | null> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  try {
    const res = await fetch(`${API_URL}/api/content${path}${query}`);
    if (!res.ok) return null;
    const body = await res.json();
    return body.data as T;
  } catch {
    return null;
  }
}

export { API_URL };
