"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { sideNavStyles } from "@education-erp/ui";
import { Home, CalendarCheck, ClipboardList, BookOpen, Layers, Target, Users, Plane, User, AlertCircle, CalendarClock } from "lucide-react";

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

// Rendered inside the shared AppShell, both as the desktop sidebar and the phone drawer.
export function TeacherNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} aria-current={isActive ? "page" : undefined} className={sideNavStyles.link(isActive)}>
            <Icon className={sideNavStyles.icon(isActive)} />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
