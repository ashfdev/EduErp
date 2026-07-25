"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, ConfirmDialog, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Badge, StatusBadge, EmptyState, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage } from "@education-erp/ui";
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
  overtime_pay: number;
  late_deduction: number;
  substitution_bonus: number;
  pf_amount: number;
  tds_amount: number;
  absent_deduction: number;
  advance_deducted: number;
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

  const [breakdownTarget, setBreakdownTarget] = useState<PayrollRow | null>(null);

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
        action={
          <div className="flex gap-2">
            <Link href="/hr/payroll/reports"><Button variant="outline">Reports</Button></Link>
            <Link href="/hr/salary-structures"><Button variant="outline">Salary Structures</Button></Link>
            <Button variant="outline" onClick={downloadExcel}>Export Excel</Button>
          </div>
        }
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead><TableHead>Staff</TableHead><TableHead>Department</TableHead><TableHead>Working</TableHead>
                  <TableHead>Present</TableHead><TableHead>Gross</TableHead><TableHead>Deductions</TableHead><TableHead>Net</TableHead><TableHead>Status</TableHead><TableHead>Payslip</TableHead><TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.status === "FINALIZED" && (
                        <input type="checkbox" checked={selected.includes(r.id)} onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id)))} />
                      )}
                    </TableCell>
                    <TableCell>{r.staff.name_en}</TableCell>
                    <TableCell>{r.staff.department?.name_en ?? "-"}</TableCell>
                    <TableCell>{r.working_days}</TableCell>
                    <TableCell>
                      {r.present_days}
                      {r.attendance_incomplete && (
                        <Badge variant="warning" className="ml-2" title="Fewer attendance records than working days this month — absence deduction may be inaccurate, review before finalizing">
                          Incomplete
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>৳{r.gross_salary.toFixed(0)}</TableCell>
                    <TableCell>৳{r.deductions.toFixed(0)}</TableCell>
                    <TableCell className="font-medium">৳{r.net_salary.toFixed(0)}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell>
                      <button onClick={() => setBreakdownTarget(r)} className="text-primary hover:underline">View Breakdown</button>
                      {r.status !== "DRAFT" && (
                        <>
                          {" · "}
                          <button onClick={() => downloadPayslip(r.id)} className="text-primary hover:underline">Download</button>
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.status === "PAID" && (
                        <Button size="sm" variant="destructive" onClick={() => setVoidTarget({ id: r.id, name: r.staff.name_en })}>
                          Void
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={breakdownTarget !== null} onOpenChange={(open) => !open && setBreakdownTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Salary Breakdown — {breakdownTarget?.staff.name_en}</DialogTitle></DialogHeader>
          {breakdownTarget && (
            <div className="space-y-4 text-sm">
              <div>
                <p className="mb-1 font-medium text-muted-foreground">Earnings</p>
                <div className="space-y-1">
                  <div className="flex justify-between"><span>Gross Salary</span><span>৳{breakdownTarget.gross_salary.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Overtime</span><span>৳{breakdownTarget.overtime_pay.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Substitution Bonus</span><span>৳{breakdownTarget.substitution_bonus.toFixed(2)}</span></div>
                </div>
              </div>
              <div>
                <p className="mb-1 font-medium text-muted-foreground">Deductions</p>
                <div className="space-y-1">
                  <div className="flex justify-between"><span>Provident Fund</span><span>৳{breakdownTarget.pf_amount.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>TDS</span><span>৳{breakdownTarget.tds_amount.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Absence</span><span>৳{breakdownTarget.absent_deduction.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Late</span><span>৳{breakdownTarget.late_deduction.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Advance Recovery</span><span>৳{breakdownTarget.advance_deducted.toFixed(2)}</span></div>
                  <div className="flex justify-between font-medium"><span>Total Deductions</span><span>৳{breakdownTarget.deductions.toFixed(2)}</span></div>
                </div>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <span>Net Salary</span><span>৳{breakdownTarget.net_salary.toFixed(2)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
