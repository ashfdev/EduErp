"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface DueInvoice {
  id: string;
  description: string;
  amount_due: number;
  amount_paid: number;
  days_overdue_computed: number;
  student: { name_en: string; student_uid: string; father_phone: string | null };
}
interface DefaulterEntry {
  student: { name_en: string; student_uid: string; father_phone: string | null };
  total_due: number;
  invoice_count: number;
}

export default function FeeReportsPage() {
  return (
    <PageWrapper>
      <PageHeader title="Fee Reports" breadcrumbs={[{ label: "Fees", href: "/fees" }, { label: "Reports" }]} />
      <Tabs defaultValue="dues">
        <TabsList>
          <TabsTrigger value="dues">Outstanding Dues</TabsTrigger>
          <TabsTrigger value="defaulters">Defaulters</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>
        <TabsContent value="dues"><DuesTab /></TabsContent>
        <TabsContent value="defaulters"><DefaultersTab /></TabsContent>
        <TabsContent value="export"><ExportTab /></TabsContent>
      </Tabs>
    </PageWrapper>
  );
}

function DuesTab() {
  const { data } = useQuery<DueInvoice[]>({ queryKey: ["fees", "reports", "dues"], queryFn: async () => (await api.get("/api/fees/reports/dues")).data.data });
  if (!data?.length) return <EmptyState title="No outstanding dues" />;
  return (
    <Card>
      <CardContent className="pt-6">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Student</th><th className="p-2">Description</th><th className="p-2">Due</th><th className="p-2">Days Overdue</th></tr></thead>
          <tbody>
            {data.map((inv) => (
              <tr key={inv.id} className="border-b">
                <td className="p-2">{inv.student.name_en}</td>
                <td className="p-2">{inv.description}</td>
                <td className="p-2">৳{inv.amount_due - inv.amount_paid}</td>
                <td className="p-2 text-red-600">{inv.days_overdue_computed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function DefaultersTab() {
  const [days, setDays] = useState(30);
  const [enabled, setEnabled] = useState(false);
  const { data } = useQuery<DefaulterEntry[]>({
    queryKey: ["fees", "reports", "defaulters", days],
    queryFn: async () => (await api.get("/api/fees/reports/defaulters", { params: { days_overdue: days } })).data.data,
    enabled,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-32" />
        <Button size="sm" onClick={() => setEnabled(true)}>Find Defaulters</Button>
      </div>
      {data && !data.length && <EmptyState title="No defaulters found" />}
      {!!data?.length && (
        <Card>
          <CardContent className="pt-6">
            <table className="w-full text-sm">
              <tbody>
                {data.map((d, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{d.student.name_en}</td>
                    <td className="p-2 font-mono text-xs">{d.student.student_uid}</td>
                    <td className="p-2 text-red-600">৳{d.total_due}</td>
                    <td className="p-2">{d.invoice_count} invoice(s)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ExportTab() {
  const [from, setFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  async function download() {
    const res = await api.get("/api/fees/reports/export", { params: { from, to }, responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Fee_Collection_${from}_${to}.xlsx`;
    a.click();
  }

  return (
    <div className="flex items-end gap-3">
      <div><label className="text-sm">From</label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
      <div><label className="text-sm">To</label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      <Button onClick={download}>Download Excel</Button>
    </div>
  );
}
