"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchContent, ContentNotFoundError } from "@/lib/content-api";

interface UseContentResult<T> {
  data: T | null;
  loading: boolean;
  /** A real failure (network/server) — show an ErrorState with retry. */
  error: boolean;
  /** A 404 from a single-entity route — a legitimate "nothing here yet",
   *  never a connectivity problem. Only ever true for detail routes; a list
   *  route resolves to an empty array instead and never sets this. */
  notFound: boolean;
  refetch: () => void;
}

// Replaces the `fetchContent(path).then(d => setX(d ?? []))` pattern
// duplicated across every content page — that pattern couldn't distinguish
// a failed request from a genuinely empty/not-found result, so an outage
// silently rendered as "nothing here" instead of a real error. This hook
// surfaces `error` (real failure) separately from `notFound` (legitimate
// 404) so pages can show the right message for each.
export function useContent<T>(path: string | null, params?: Record<string, string>): UseContentResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const paramsKey = params ? JSON.stringify(params) : "";

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    setNotFound(false);
    fetchContent<T>(path, params)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ContentNotFoundError) setNotFound(true);
        else setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, paramsKey, reloadKey]);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);
  return { data, loading, error, notFound, refetch };
}
