"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, ConfirmDialog, Input, Badge, StatusBadge, EmptyState, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface PayrollRow {
  id: string;
  staff: { name_en: string; department: { name_en: string } | null };
  working_days: number;
  present_days: number;
  attendance_incomplete: boolean;
  gross_salary: number;
  deductions: number;
  net_salary: number;
  status: string;
}
interface DepartmentOption {
  id: string;
  name_en: string;
}

export default function PayrollPage() {
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [selected, setSelected] = useState<string[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("");

  const { data: departments } = useQuery<DepartmentOption[]>({
    queryKey: ["settings", "departments"],
    queryFn: async () => (await api.get("/api/settings/departments")).data.data,
  });

  const { data: records } = useQuery<PayrollRow[]>({
    queryKey: ["hr", "payroll", month, year, departmentId, status],
    queryFn: async () =>
      (
        await api.get("/api/hr/payroll", {
          params: { month, year, department_id: departmentId || undefined, status: status || undefined },
        })
      ).data.data,
  });

  const calculateMutation = useMutation({
    mutationFn: () => api.post("/api/hr/payroll/calculate", { month, year, department_id: departmentId || undefined }),
    onSuccess: (res) => {
      toast.success(`Processed ${res.data.data.processed} staff — total payable ৳${res.data.data.total_payable}`);
      queryClient.invalidateQueries({ queryKey: ["hr", "payroll", month, year] });
    },
    onError: () => toast.error("Failed to calculate payroll"),
  });

  const finalizeMutation = useMutation({
    mutationFn: () => api.post("/api/hr/payroll/finalize", { month, year }),
    onSuccess: (res) => {
      toast.success(`Finalized ${res.data.data.finalized} payslip(s)`);
      queryClient.invalidateQueries({ queryKey: ["hr", "payroll", month, year] });
    },
    onError: () => toast.error("Failed to finalize payroll"),
  });

  const markPaidMutation = useMutation({
    mutationFn: () => api.post("/api/hr/payroll/mark-paid", { payroll_ids: selected }),
    onSuccess: (res) => {
      toast.success(`Marked ${res.data.data.updated} record(s) as paid`);
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["hr", "payroll", month, year] });
    },
  });

  const [voidTarget, setVoidTarget] = useState<{ id: string; name: string } | null>(null);
  const voidMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/hr/payroll/${id}/void`, {}),
    onSuccess: () => {
      toast.success("Payroll record voided — its accounting entry has been reversed");
      queryClient.invalidateQueries({ queryKey: ["hr", "payroll", month, year] });
      setVoidTarget(null);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Void failed"),
  });

  const hasDraft = records?.some((r) => r.status === "DRAFT");
  const hasFinalized = records?.some((r) => r.status === "FINALIZED");

  async function downloadPayslip(id: string) {
    const res = await api.get(`/api/documents/payroll/payslip/${id}`, { params: { download: "true" }, responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payslip-${id}.pdf`;
    a.click();
  }

  async function downloadExcel() {
    const res = await api.get("/api/hr/payroll/export", { params: { month, year }, responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Payroll_${month}_${year}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Payroll"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Payroll" }]}
        action={<Button variant="outline" onClick={downloadExcel}>Export Excel</Button>}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div><label className="text-sm">Month</label><Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-24" /></div>
        <div><label className="text-sm">Year</label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" /></div>
        <div>
          <label className="text-sm">Department</label>
          <select className="block w-44 rounded-md border px-3 py-2 text-sm" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">All Departments</option>
            {departments?.map((d) => <option key={d.id} value={d.id}>{d.name_en}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm">Status</label>
          <select className="block w-36 rounded-md border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="FINALIZED">Finalized</option>
            <option value="PAID">Paid</option>
          </select>
        </div>
        <Button onClick={() => calculateMutation.mutate()} disabled={calculateMutation.isPending}>Calculate Payroll</Button>
        {hasDraft && <Button variant="outline" onClick={() => finalizeMutation.mutate()} disabled={finalizeMutation.isPending}>Finalize Month</Button>}
        {hasFinalized && selected.length > 0 && <Button variant="outline" onClick={() => markPaidMutation.mutate()} disabled={markPaidMutation.isPending}>Mark Paid ({selected.length})</Button>}
      </div>

      {!records?.length && <EmptyState title="No payroll records for this month yet" description="Click Calculate Payroll to generate draft records" />}
      {!!records?.length && (
        <Card>
          <CardContent className="pt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2"></th><th className="p-2">Staff</th><th className="p-2">Department</th><th className="p-2">Working</th>
                  <th className="p-2">Present</th><th className="p-2">Gross</th><th className="p-2">Deductions</th><th className="p-2">Net</th><th className="p-2">Status</th><th className="p-2">Payslip</th><th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="p-2">
                      {r.status === "FINALIZED" && (
                        <input type="checkbox" checked={selected.includes(r.id)} onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id)))} />
                      )}
                    </td>
                    <td className="p-2">{r.staff.name_en}</td>
                    <td className="p-2">{r.staff.department?.name_en ?? "-"}</td>
                    <td className="p-2">{r.working_days}</td>
                    <td className="p-2">
                      {r.present_days}
                      {r.attendance_incomplete && (
                        <Badge variant="warning" className="ml-2" title="Fewer attendance records than working days this month — absence deduction may be inaccurate, review before finalizing">
                          Incomplete
                        </Badge>
                      )}
                    </td>
                    <td className="p-2">৳{r.gross_salary.toFixed(0)}</td>
                    <td className="p-2">৳{r.deductions.toFixed(0)}</td>
                    <td className="p-2 font-medium">৳{r.net_salary.toFixed(0)}</td>
                    <td className="p-2"><StatusBadge status={r.status} /></td>
                    <td className="p-2">
                      {r.status !== "DRAFT" && <button onClick={() => downloadPayslip(r.id)} className="text-primary hover:underline">Download</button>}
                    </td>
                    <td className="p-2">
                      {r.status === "PAID" && (
                        <Button size="sm" variant="destructive" onClick={() => setVoidTarget({ id: r.id, name: r.staff.name_en })}>
                          Void
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={voidTarget !== null}
        onOpenChange={(open) => !open && setVoidTarget(null)}
        title="Void this payroll record?"
        description={voidTarget ? `Void ${voidTarget.name}'s payroll for this month? This reverses its accounting entry — use this if it was paid by mistake or the amount was wrong. This cannot be undone from here.` : undefined}
        confirmLabel="Void"
        destructive
        loading={voidMutation.isPending}
        onConfirm={() => voidTarget && voidMutation.mutate(voidTarget.id)}
      />
    </PageWrapper>
  );
}
