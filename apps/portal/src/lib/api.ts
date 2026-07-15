import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth-store";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  // No timeout meant a genuinely hung/slow request left the caller waiting
  // forever with no cutoff — the portal's own loading spinner had no way
  // to ever resolve to an error state in that case.
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return null;

  try {
    const res = await axios.post(`${api.defaults.baseURL}/api/auth/refresh`, { refresh_token: refreshToken });
    const { access_token, refresh_token } = res.data.data;
    useAuthStore.setState({ accessToken: access_token, refreshToken: refresh_token });
    return access_token;
  } catch {
    return null;
  }
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;

    if (error.response?.status === 401 && config && !config._retried && !config.url?.includes("/api/auth/")) {
      config._retried = true;
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
      const newToken = await refreshPromise;

      if (newToken) {
        config.headers.Authorization = `Bearer ${newToken}`;
        return api.request(config);
      }

      useAuthStore.getState().logout();
      if (typeof window !== "undefined") window.location.href = "/login";
    }

    return Promise.reject(error);
  },
);
