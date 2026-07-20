const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// A 404 from a single-entity content route (a StaticPage not yet written, a
// faculty id that doesn't exist) is an expected, legitimate outcome — most
// StaticPage slugs genuinely have no row on a fresh install — never a
// connectivity/server problem. Callers need to tell the two apart to show
// "not configured yet" instead of a scary "couldn't load" error.
export class ContentNotFoundError extends Error {}

// Throws on a real fetch failure (network error or non-2xx) instead of
// swallowing it into a `null` return — a resolved value from here now
// unambiguously means "the API legitimately returned this," never "the
// request failed," so callers (see useContent below) can show a real error
// state instead of silently rendering as empty.
export async function fetchContent<T>(path: string, params?: Record<string, string>): Promise<T> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  const res = await fetch(`${API_URL}/api/content${path}${query}`);
  if (res.status === 404) throw new ContentNotFoundError(`Not found: ${path}`);
  if (!res.ok) throw new Error(`Content request failed: ${res.status} ${path}`);
  const body = await res.json();
  return body.data as T;
}

export { API_URL };
