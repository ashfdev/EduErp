import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  id: string;
  name_en: string;
  name_bn?: string | null;
  role: string;
  phone: string;
  lang_pref?: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  // Next.js server-renders with the store's pre-persist default
  // (isAuthenticated: false); zustand/persist then reads localStorage
  // client-side, which is asynchronous relative to React's first render.
  // A redirect-on-mount effect that trusts isAuthenticated before this
  // flips true would bounce an already-logged-in user to /login on every
  // hard refresh or direct URL visit — hasHydrated gates that check.
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  setSession: (data: { user: AuthUser; access_token: string; refresh_token: string }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setSession: ({ user, access_token, refresh_token }) =>
        set({ user, accessToken: access_token, refreshToken: refresh_token, isAuthenticated: true }),
      logout: () => set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
    }),
    {
      name: "eduerp-teacher-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);
