"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { LanguageToggle } from "@/components/language-toggle";
import { useInstitution } from "@/hooks/use-institution";

const NAV_ITEMS = [
  { href: "/", key: "home" },
  { href: "/attendance", key: "attendance" },
  { href: "/marks", key: "marks" },
  { href: "/resources", key: "resources" },
  { href: "/quizzes", key: "quizzes" },
  { href: "/ptm", key: "ptm" },
  { href: "/leave", key: "leave" },
  { href: "/profile", key: "profile" },
] as const;

export function TeacherNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { institutionName, logoUrl } = useInstitution();
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");

  return (
    <header className="sticky top-0 z-30 border-b bg-white">
      <div className="mx-auto flex max-w-3xl items-center gap-6 px-4 py-3">
        <div className="flex shrink-0 items-center gap-2">
          {logoUrl ? <img src={logoUrl} alt="Logo" className="h-7 w-7 rounded object-contain" /> : null}
          <span className="truncate text-sm font-medium text-gray-700">{institutionName ?? "Education ERP"}</span>
        </div>
        <nav className="flex flex-1 flex-wrap gap-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm font-medium ${pathname === item.href ? "text-[var(--primary,#1a3c4a)]" : "text-gray-500"}`}
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{user?.name_en}</span>
          <LanguageToggle />
          <button
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            {tCommon("logOut")}
          </button>
        </div>
      </div>
    </header>
  );
}
