"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard, Users, GraduationCap, AlertCircle, FileText,
  ClipboardCheck, FileSpreadsheet, Edit3, Award, BookOpen,
  Wallet, Calculator, Package, UserPlus, Printer, Globe,
  Briefcase, Library, Bus, Home, BarChart3, MessageSquare,
  Settings, ChevronDown, DoorOpen, CalendarClock, type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  key: string;
  icon: LucideIcon;
}

interface NavGroup {
  key: string;
  items: NavItem[];
}

// Dashboard stays outside every group — always one click away, never
// collapsible. Every other item lives in exactly one group below, chosen so
// every future nav destination (Waiver Setup, Employee Attendance, Gate
// Pass, Leave Requests, Proxy/Substitute — see Plan Thirteen) already has a
// home instead of needing the nav restructured a second time.
const DASHBOARD_ITEM: NavItem = { href: "/dashboard", key: "dashboard", icon: LayoutDashboard };

const NAV_GROUPS: NavGroup[] = [
  {
    key: "academic",
    items: [
      { href: "/attendance/mark", key: "attendance", icon: ClipboardCheck },
      { href: "/examination", key: "examination", icon: FileSpreadsheet },
      { href: "/marks", key: "marks", icon: Edit3 },
      { href: "/results", key: "results", icon: Award },
      { href: "/course-enrollment", key: "courseEnrollment", icon: BookOpen },
    ],
  },
  {
    key: "students",
    items: [
      { href: "/students", key: "students", icon: Users },
      { href: "/alumni", key: "alumni", icon: GraduationCap },
      { href: "/complaints", key: "complaints", icon: AlertCircle },
      { href: "/document-requests", key: "documentRequests", icon: FileText },
      { href: "/student-leave", key: "studentLeaveRequests", icon: CalendarClock },
    ],
  },
  {
    key: "admission",
    items: [{ href: "/admission", key: "admission", icon: UserPlus }],
  },
  {
    key: "finance",
    items: [
      { href: "/fees", key: "fees", icon: Wallet },
      { href: "/accounts", key: "accounts", icon: Calculator },
      { href: "/fees/waivers", key: "waiverSetup", icon: Wallet },
    ],
  },
  {
    key: "hrStaff",
    items: [
      { href: "/hr", key: "hr", icon: Briefcase },
      { href: "/hr/attendance", key: "employeeAttendance", icon: ClipboardCheck },
    ],
  },
  {
    key: "campus",
    items: [
      { href: "/inventory", key: "inventory", icon: Package },
      { href: "/library", key: "library", icon: Library },
      { href: "/transport", key: "transport", icon: Bus },
      { href: "/hostel", key: "hostel", icon: Home },
      { href: "/gatepass", key: "gatePass", icon: DoorOpen },
    ],
  },
  {
    key: "communication",
    items: [
      { href: "/website", key: "website", icon: Globe },
      { href: "/documents/print", key: "documents", icon: Printer },
      { href: "/notifications/bulk-sms", key: "bulkSms", icon: MessageSquare },
    ],
  },
  {
    key: "system",
    items: [
      { href: "/reports", key: "reports", icon: BarChart3 },
      { href: "/settings/institution", key: "settings", icon: Settings },
    ],
  },
];

const ALL_ITEMS: NavItem[] = [DASHBOARD_ITEM, ...NAV_GROUPS.flatMap((g) => g.items)];

// Longest-prefix match across every nav item, not a plain per-item
// startsWith — two items can share a prefix (e.g. /hr and /hr/attendance),
// and without this only the most specific one should ever show as active.
function bestMatchingHref(pathname: string): string | null {
  let best: string | null = null;
  for (const item of ALL_ITEMS) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.length) best = item.href;
    }
  }
  return best;
}

function isItemActive(activeHref: string | null, href: string) {
  return activeHref === href;
}

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const t = useTranslations("nav");
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
        isActive ? "bg-primary text-white shadow-md shadow-primary/25" : "text-slate-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {t(item.key)}
    </Link>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  const tGroups = useTranslations("navGroups");
  const activeHref = bestMatchingHref(pathname);

  // Whichever group contains the current route is expanded; every other
  // group starts collapsed and can be manually toggled. Re-evaluated on
  // every pathname change (an effect, not just a lazy initial useState) —
  // Next.js <Link> client-side navigation doesn't remount this component,
  // so a one-time-at-mount computation would only auto-expand on a hard
  // reload and never when navigating between groups via the sidebar/in-page
  // links, which is the far more common path. Adds the active group without
  // removing any group the admin already had open manually.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const active = NAV_GROUPS.find((g) => g.items.some((item) => item.href === activeHref));
    return new Set(active ? [active.key] : []);
  });

  useEffect(() => {
    const active = NAV_GROUPS.find((g) => g.items.some((item) => item.href === activeHref));
    if (active) setOpenGroups((prev) => (prev.has(active.key) ? prev : new Set(prev).add(active.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHref]);

  function toggleGroup(key: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <nav className="flex flex-col gap-1 text-sm font-medium">
      <NavLink item={DASHBOARD_ITEM} isActive={isItemActive(activeHref, DASHBOARD_ITEM.href)} />

      {NAV_GROUPS.map((group) => {
        const isOpen = openGroups.has(group.key);
        const groupHasActive = group.items.some((item) => isItemActive(activeHref, item.href));
        return (
          <div key={group.key} className="mt-1">
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                groupHasActive ? "text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {tGroups(group.key)}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="flex flex-col gap-1 pl-1">
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} isActive={isItemActive(activeHref, item.href)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
