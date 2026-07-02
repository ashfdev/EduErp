"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface ReportLink {
  label: string;
  href?: string;
  reportKey?: string;
}

const CATEGORIES: { title: string; items: ReportLink[] }[] = [
  {
    title: "Academic Reports",
    items: [
      { label: "Class-wise Attendance Summary", href: "/attendance/reports" },
      { label: "Exam Result Summary", href: "/results" },
      { label: "Campus-wide Result", href: "/results" },
      { label: "Merit List (PDF)", href: "/documents/print" },
      { label: "Marksheets / Tabulation (PDF)", href: "/documents/print" },
    ],
  },
  {
    title: "Finance Reports",
    items: [
      { label: "Daily / Monthly Collection", href: "/fees" },
      { label: "Outstanding Dues Report", href: "/fees/reports" },
      { label: "Defaulter List", href: "/fees/reports" },
      { label: "Fee Ledger Export (Excel)", href: "/fees/reports" },
      { label: "Payroll Report", href: "/hr/payroll" },
    ],
  },
  {
    title: "HR Reports",
    items: [
      { label: "Staff Attendance Report", reportKey: "staff-attendance" },
      { label: "Leave Summary Report", reportKey: "leave-summary" },
      { label: "Staff List (by Department)", href: "/hr/staff" },
    ],
  },
  {
    title: "Management Reports",
    items: [
      { label: "Enrollment Report (Class-wise)", href: "/students" },
      { label: "Year-wise Enrollment Trend", reportKey: "enrollment-trend" },
      { label: "Dropout Risk Analysis", reportKey: "defaulters-risk" },
      { label: "Library Utilization", reportKey: "library-utilization" },
    ],
  },
];

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]!);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

function InlineReport({ reportKey, onClose }: { reportKey: string; onClose: () => void }) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);

  const needsRange = reportKey === "staff-attendance" || reportKey === "leave-summary";
  const { data } = useQuery<Record<string, unknown>[]>({
    queryKey: ["reports", reportKey],
    queryFn: async () => {
      const params = needsRange ? { from_date: from, to_date: to } : {};
      const res = await api.get(`/api/analytics/${reportKey}`, { params });
      return res.data.data;
    },
  });

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between">
          <p className="font-medium">{reportKey.replace(/-/g, " ")}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => data && downloadCsv(`${reportKey}.csv`, data)}>Download CSV</Button>
            <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
        {!data?.length && <EmptyState title="No data available" />}
        {!!data?.length && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  {Object.keys(data[0]!).map((k) => <th key={k} className="p-2">{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-b">
                    {Object.keys(data[0]!).map((k) => <td key={k} className="p-2">{typeof row[k] === "object" ? JSON.stringify(row[k]) : String(row[k] ?? "-")}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportCenterPage() {
  const [activeReport, setActiveReport] = useState<string | null>(null);

  return (
    <PageWrapper>
      <PageHeader title="Report Center" breadcrumbs={[{ label: "Reports" }]} />

      <Tabs defaultValue={CATEGORIES[0]!.title}>
        <TabsList>
          {CATEGORIES.map((c) => <TabsTrigger key={c.title} value={c.title}>{c.title}</TabsTrigger>)}
        </TabsList>
        {CATEGORIES.map((c) => (
          <TabsContent key={c.title} value={c.title}>
            <Card>
              <CardContent className="divide-y pt-6">
                {c.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-2">
                    <span className="text-sm">{item.label}</span>
                    {item.href ? (
                      <Link href={item.href}><Button size="sm" variant="outline">Open</Button></Link>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setActiveReport(item.reportKey!)}>Preview</Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {activeReport && <InlineReport reportKey={activeReport} onClose={() => setActiveReport(null)} />}
    </PageWrapper>
  );
}
