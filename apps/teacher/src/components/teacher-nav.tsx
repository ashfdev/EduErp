"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { LanguageToggle } from "@/components/language-toggle";
import { useInstitution } from "@/hooks/use-institution";
import { Home, CalendarCheck, BookOpen, Layers, Target, Users, Plane, User, LogOut } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", key: "home", icon: Home },
  { href: "/attendance", key: "attendance", icon: CalendarCheck },
  { href: "/marks", key: "marks", icon: BookOpen },
  { href: "/quizzes", key: "quizzes", icon: Target },
  { href: "/resources", key: "resources", icon: Layers },
  { href: "/ptm", key: "ptm", icon: Users },
  { href: "/leave", key: "leave", icon: Plane },
  { href: "/profile", key: "profile", icon: User },
];

export function TeacherNav({ isMobile }: { isMobile?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { institutionName, logoUrl } = useInstitution();
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  if (isMobile) {
    return (
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col min-w-[72px] items-center justify-center p-2 rounded-xl transition-all ${
                isActive ? "text-primary bg-primary/10" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
              <span className="text-[10px] mt-1 font-medium">{t(item.key)}</span>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex shrink-0 items-center gap-3 px-2 py-4">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-9 w-9 rounded-xl shadow-sm object-contain bg-white" />
        ) : (
          <div className="h-9 w-9 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-lg shrink-0">
            T
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold text-slate-100 leading-tight pr-2">
            {institutionName ?? "Education ERP"}
          </span>
          <span className="truncate text-xs text-slate-400 font-medium mt-0.5">Teacher Portal</span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 mt-6">
        <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Main Menu</p>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
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
