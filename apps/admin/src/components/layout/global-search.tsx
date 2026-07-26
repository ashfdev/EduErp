"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { CommandPalette, type CommandPaletteItem } from "@education-erp/ui";
import { api } from "@/lib/api";
import { SETTINGS_GROUPS } from "@/lib/settings-nav";
import { NAV_GROUPS, DASHBOARD_ITEM } from "./sidebar-nav";

interface StudentSearchResult {
  id: string;
  name_en: string;
  student_uid: string;
  current_class?: { name_en: string } | null;
  current_section?: { name: string } | null;
}
interface StaffSearchResult {
  id: string;
  name_en: string;
  staff_uid: string;
  designation: string;
}

// Global admin search (Plan Fifteen, Phase C) — replaces the old plain
// header <input> (which only ever navigated to /students?search=... and went
// stale on a second search without a fresh page load) with a real Ctrl/Cmd+K
// command palette searching Students, Staff, and every Settings/nav
// destination — directly answering both "student search doesn't work" and
// "settings search doesn't exist" from the same complaint.
export function GlobalSearch() {
  const router = useRouter();
  const tNav = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const q = query.trim().toLowerCase();

  const { data: students, isFetching: studentsLoading } = useQuery<StudentSearchResult[]>({
    queryKey: ["global-search", "students", q],
    queryFn: async () => (await api.get("/api/students", { params: { search: q, limit: 6 } })).data.data,
    enabled: q.length > 1,
  });
  const { data: staff, isFetching: staffLoading } = useQuery<StaffSearchResult[]>({
    queryKey: ["global-search", "staff", q],
    queryFn: async () => (await api.get("/api/hr/staff", { params: { search: q, limit: 6 } })).data.data,
    enabled: q.length > 1,
  });

  const navItems = useMemo(() => [DASHBOARD_ITEM, ...NAV_GROUPS.flatMap((g) => g.items)], []);

  const items: CommandPaletteItem[] = useMemo(() => {
    const result: CommandPaletteItem[] = [];

    for (const s of students ?? []) {
      result.push({
        id: `student-${s.id}`,
        group: "Students",
        label: s.name_en,
        sublabel: [s.student_uid, s.current_class?.name_en, s.current_section?.name].filter(Boolean).join(" · "),
        onSelect: () => router.push(`/students/${s.id}`),
      });
    }
    for (const st of staff ?? []) {
      result.push({
        id: `staff-${st.id}`,
        group: "Staff",
        label: st.name_en,
        sublabel: [st.staff_uid, st.designation].filter(Boolean).join(" · "),
        onSelect: () => router.push(`/hr/staff/${st.id}`),
      });
    }

    // Nav + Settings destinations are always client-filtered, regardless of
    // query length, so Ctrl/Cmd+K with an empty query still offers a quick
    // jump-list of every page.
    for (const item of navItems) {
      const label = tNav(item.key);
      if (q && !label.toLowerCase().includes(q)) continue;
      result.push({ id: `nav-${item.href}`, group: "Go to", label, onSelect: () => router.push(item.href) });
    }
    for (const group of SETTINGS_GROUPS) {
      for (const item of group.items) {
        if (q && !item.label.toLowerCase().includes(q) && !group.label.toLowerCase().includes(q)) continue;
        result.push({ id: `settings-${item.href}`, group: "Settings", label: item.label, sublabel: group.label, onSelect: () => router.push(item.href) });
      }
    }
    return result;
  }, [students, staff, navItems, q, tNav, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-full border border-input bg-muted/50 px-4 text-sm text-muted-foreground transition-all hover:bg-muted md:flex"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Search students, staff, settings...</span>
        <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Ctrl K</kbd>
      </button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        query={query}
        onQueryChange={setQuery}
        items={items}
        loading={q.length > 1 && (studentsLoading || staffLoading)}
      />
    </>
  );
}
