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
  setSession: (data: { user: AuthUser; access_token: string; refresh_token: string }) => void;
  setStudents: (students: PortalStudent[]) => void;
  setActiveStudent: (id: string) => void;
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
      setSession: ({ user, access_token, refresh_token }) =>
        set({ user, accessToken: access_token, refreshToken: refresh_token, isAuthenticated: true }),
      setStudents: (students) =>
        set((state) => ({ students, activeStudentId: state.activeStudentId ?? students[0]?.id ?? null })),
      setActiveStudent: (id) => set({ activeStudentId: id }),
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
    },
  ),
);
