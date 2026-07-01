import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LoginResponse } from '@education-erp/shared-types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: LoginResponse['user'] | null;
  login: (identifier: string, password: string) => Promise<void>;
  refresh: () => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,

      login: async (identifier, password) => {
        const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, password }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? 'Login failed');
        }
        const data: LoginResponse = await res.json();
        set({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
      },

      refresh: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;

        const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;

        const data: { accessToken: string } = await res.json();
        set({ accessToken: data.accessToken });
        return true;
      },

      logout: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'eduerp-admin-auth' },
  ),
);
