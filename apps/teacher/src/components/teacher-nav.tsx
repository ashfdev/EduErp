"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { LanguageToggle } from "@/components/language-toggle";
import { useInstitution } from "@/hooks/use-institution";
import { Home, CalendarCheck, ClipboardList, BookOpen, Layers, Target, Users, Plane, User, LogOut, AlertCircle, CalendarClock, X } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", key: "home", icon: Home },
  { href: "/attendance", key: "attendance", icon: CalendarCheck },
  { href: "/attendance/subject", key: "attendanceSubject", icon: ClipboardList },
  { href: "/marks", key: "marks", icon: BookOpen },
  { href: "/quizzes", key: "quizzes", icon: Target },
  { href: "/resources", key: "resources", icon: Layers },
  { href: "/ptm", key: "ptm", icon: Users },
  { href: "/student-leave", key: "studentLeave", icon: CalendarClock },
  { href: "/leave", key: "leave", icon: Plane },
  { href: "/complaints", key: "complaints", icon: AlertCircle },
  { href: "/profile", key: "profile", icon: User },
];

// Single vertical nav, reused as-is for the persistent desktop sidebar and
// inside teacher-shell.tsx's mobile drawer — no more separate horizontal
// bottom-bar rendering (product decision 2026-09-23: side nav on every
// screen size, not just desktop, for consistency).
//
// onClose is only passed by the mobile drawer: it renders the drawer's close
// button inline in the branding row (so a long institution name can't run
// underneath it) and also closes the drawer when the teacher taps the link for
// the page they're already on, which the shell's pathname-change auto-close
// never sees.
export function TeacherNav({ onClose }: { onClose?: () => void } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { institutionName, logoUrl } = useInstitution();
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    // min-h-0 + the nav's own overflow-y-auto keep the branding row and the
    // logout footer pinned while only the link list scrolls — 11 links plus
    // header/footer don't fit on a short phone (or a short laptop screen),
    // and without this Logout simply ended up off-screen and unreachable.
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="flex shrink-0 items-center gap-3 px-2 py-4">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-9 w-9 rounded-xl shadow-sm object-contain bg-white" />
        ) : (
          <div className="h-9 w-9 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-lg shrink-0">
            T
          </div>
        )}
        <div className="flex flex-1 flex-col min-w-0">
          <span className="text-sm font-bold text-slate-100 leading-tight pr-2">
            {institutionName ?? "Education ERP"}
          </span>
          <span className="truncate text-xs text-slate-400 font-medium mt-0.5">Teacher Portal</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* -mx-2 px-2 pb-3: a scroll container clips on both axes, so this
          gives the active link's shadow room without moving any link. */}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto -mx-2 px-2 pb-3 mt-6">
        <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Main Menu</p>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/50"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-slate-400"}`} />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 pt-6 border-t border-slate-800">
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <div className="h-8 w-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs shrink-0">
            {user?.name_en?.charAt(0) ?? "U"}
          </div>
          <div className="flex flex-col overflow-hidden min-w-0">
            <span className="truncate text-xs font-bold text-slate-200">{user?.name_en}</span>
            <span className="truncate text-[10px] text-slate-400 capitalize">{user?.role?.replace(/_/g, ' ').toLowerCase()}</span>
          </div>
        </div>

        <div className="flex items-center justify-between px-1">
          <div className="text-slate-300">
            <LanguageToggle />
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-slate-800"
          >
            <LogOut className="h-3.5 w-3.5" />
            {tCommon("logOut")}
          </button>
        </div>
      </div>
    </div>
  );
}
