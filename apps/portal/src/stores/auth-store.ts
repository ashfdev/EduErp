import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  id: string;
  name_en: string;
  name_bn?: string | null;
  role: string;
  phone: string;
  lang_pref?: string;
  must_change_password?: boolean;
}

export interface PortalStudent {
  id: string;
  student_uid: string;
  name_en: string;
  name_bn: string | null;
  photo_url: string | null;
  current_roll_no: string | null;
  current_class: { id: string; name_en: string } | null;
  current_section: { id: string; name: string } | null;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  students: PortalStudent[];
  activeStudentId: string | null;
  // Next.js server-renders with the store's pre-persist default
  // (isAuthenticated: false); zustand/persist then reads localStorage
  // client-side, which lands after React's first render. A redirect-on-mount
  // effect that trusts isAuthenticated before this flips true bounces an
  // already-logged-in user to /login on every hard refresh or direct URL
  // visit — hasHydrated gates that check. (Confirmed reproducing here via
  // direct navigation to /subjects and /transport-hostel, same as the
  // apps/teacher instance of this bug.)
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  setSession: (data: { user: AuthUser; access_token: string; refresh_token: string }) => void;
  setStudents: (students: PortalStudent[]) => void;
  setActiveStudent: (id: string) => void;
  clearMustChangePassword: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      students: [],
      activeStudentId: null,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setSession: ({ user, access_token, refresh_token }) =>
        set({ user, accessToken: access_token, refreshToken: refresh_token, isAuthenticated: true }),
      // A previously-persisted activeStudentId can survive into a different
      // login (e.g. switching test accounts in the same browser without an
      // explicit logout) -- keeping it unvalidated would silently point
      // every query at a student that doesn't belong to this account at
      // all, which the portal has no visible way to explain to the user
      // (a 403 that just looks like "nothing loads"). Only keep it when
      // it's actually a member of THIS login's real student list.
      setStudents: (students) =>
        set((state) => ({
          students,
          activeStudentId: students.some((s) => s.id === state.activeStudentId) ? state.activeStudentId : (students[0]?.id ?? null),
        })),
      setActiveStudent: (id) => set({ activeStudentId: id }),
      clearMustChangePassword: () =>
        set((state) => (state.user ? { user: { ...state.user, must_change_password: false } } : {})),
      logout: () => set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, students: [], activeStudentId: null }),
    }),
    {
      name: "eduerp-portal-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        students: state.students,
        activeStudentId: state.activeStudentId,
      }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);
