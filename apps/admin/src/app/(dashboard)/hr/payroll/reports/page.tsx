"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PageWrapper, PageHeader, Card, CardContent, Input, Label, EmptyState,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  ErrorState, LoadingSpinner, extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface StaffOption {
  id: string;
  name_en: string;
  staff_uid: string;
}
interface PayrollHistoryRow {
  id: string;
  month: number;
  year: number;
  gross_salary: number;
  deductions: number;
  net_salary: number;
  status: string;
}
interface PeriodRow {
  id: string;
  staff: { name_en: string; staff_uid: string; department: { name_en: string } | null };
  gross_salary: number;
  deductions: number;
  net_salary: number;
  status: string;
}
interface DepartmentSubtotal {
  department_id: string | null;
  department_name: string;
  count: number;
  gross_total: number;
  deductions_total: number;
  net_total: number;
}
interface GenerationRun {
  id: string;
  run_at: string;
  month: number;
  year: number;
  department_id: string | null;
  processed_count: number;
  total_payable: number;
}

function EmployeeHistoryTab() {
  const [search, setSearch] = useState("");
  const [staffId, setStaffId] = useState("");
  const { data: staffOptions } = useQuery<StaffOption[]>({
    queryKey: ["hr", "staff", "search", search],
    queryFn: async () => (await api.get("/api/hr/staff", { params: { search, limit: 10 } })).data.data,
    enabled: search.length > 1,
  });
  const { data: history, isLoading: historyLoading, isError: historyError, error: historyErrorObj, refetch: refetchHistory } = useQuery<PayrollHistoryRow[]>({
    queryKey: ["hr", "payroll", "reports", "employee", staffId],
    queryFn: async () => (await api.get(`/api/hr/payroll/reports/employee/${staffId}`)).data.data,
    enabled: !!staffId,
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5 max-w-sm">
        <Label>Search Staff</Label>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type a name or staff ID..." />
        {!!staffOptions?.length && !staffId && (
          <div className="rounded-md border bg-white shadow-sm">
            {staffOptions.map((s) => (
              <button
                key={s.id}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => { setStaffId(s.id); setSearch(s.name_en); }}
              >
                {s.name_en} ({s.staff_uid})
              </button>
            ))}
          </div>
        )}
      </div>

      {staffId && historyLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : staffId && historyError ? (
        <ErrorState title="Failed to load payroll history" description={extractErrorMessage(historyErrorObj)} retryLabel="Retry" onRetry={() => refetchHistory()} />
      ) : (
        <>
          {staffId && !history?.length && <EmptyState title="No payroll history for this staff member yet" />}
          {!!history?.length && (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Month/Year</TableHead><TableHead>Gross</TableHead><TableHead>Deductions</TableHead><TableHead>Net</TableHead><TableHead>Status</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.month}/{r.year}</TableCell>
                        <TableCell>৳{r.gross_salary.toFixed(0)}</TableCell>
                        <TableCell>৳{r.deductions.toFixed(0)}</TableCell>
                        <TableCell className="font-medium">৳{r.net_salary.toFixed(0)}</TableCell>
                        <TableCell>{r.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function PeriodReportTab() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const { data, isLoading, isError, error, refetch } = useQuery<{ records: PeriodRow[]; department_subtotals: DepartmentSubtotal[] }>({
    queryKey: ["hr", "payroll", "reports", "period", month, year],
    queryFn: async () => (await api.get("/api/hr/payroll/reports/period", { params: { month, year } })).data.data,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div><Label>Month</Label><Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-24" /></div>
        <div><Label>Year</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" /></div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load payroll report" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
      {!!data?.department_subtotals?.length && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">Department Subtotals</p>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Department</TableHead><TableHead>Staff</TableHead><TableHead>Gross</TableHead><TableHead>Deductions</TableHead><TableHead>Net</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data.department_subtotals.map((d) => (
                  <TableRow key={d.department_id ?? "none"}>
                    <TableCell>{d.department_name}</TableCell>
                    <TableCell>{d.count}</TableCell>
                    <TableCell>৳{d.gross_total.toFixed(0)}</TableCell>
                    <TableCell>৳{d.deductions_total.toFixed(0)}</TableCell>
                    <TableCell className="font-medium">৳{d.net_total.toFixed(0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!data?.records.length && <EmptyState title="No payroll records for this period" />}
      {!!data?.records.length && (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Staff</TableHead><TableHead>Department</TableHead><TableHead>Gross</TableHead><TableHead>Deductions</TableHead><TableHead>Net</TableHead><TableHead>Status</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data.records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.staff.name_en} ({r.staff.staff_uid})</TableCell>
                    <TableCell>{r.staff.department?.name_en ?? "-"}</TableCell>
                    <TableCell>৳{r.gross_salary.toFixed(0)}</TableCell>
                    <TableCell>৳{r.deductions.toFixed(0)}</TableCell>
                    <TableCell className="font-medium">৳{r.net_salary.toFixed(0)}</TableCell>
                    <TableCell>{r.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
        </>
      )}
    </div>
  );
}

function GenerationLogTab() {
  const { data, isLoading, isError, error, refetch } = useQuery<GenerationRun[]>({
    queryKey: ["hr", "payroll", "generation-log"],
    queryFn: async () => (await api.get("/api/hr/payroll/generation-log")).data.data,
  });

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  if (isError) return <ErrorState title="Failed to load generation log" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />;
  if (!data?.length) return <EmptyState title="No payroll generation runs yet" description="Runs are logged every time Calculate Payroll is used" />;

  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Run At</TableHead><TableHead>Month/Year</TableHead><TableHead>Processed</TableHead><TableHead>Total Payable</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data.map((run) => (
              <TableRow key={run.id}>
                <TableCell>{new Date(run.run_at).toLocaleString()}</TableCell>
                <TableCell>{run.month}/{run.year}</TableCell>
                <TableCell>{run.processed_count}</TableCell>
                <TableCell className="font-medium">৳{run.total_payable.toFixed(0)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function PayrollReportsPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="Payroll Reports"
        subtitle="Employee payment history, period-wise breakdowns, and the salary generation log"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Payroll", href: "/hr/payroll" }, { label: "Reports" }]}
      />
      <Tabs defaultValue="employee">
        <TabsList>
          <TabsTrigger value="employee">Employee-wise</TabsTrigger>
          <TabsTrigger value="period">Period-wise</TabsTrigger>
          <TabsTrigger value="log">Generation Log</TabsTrigger>
        </TabsList>
        <TabsContent value="employee"><EmployeeHistoryTab /></TabsContent>
        <TabsContent value="period"><PeriodReportTab /></TabsContent>
        <TabsContent value="log"><GenerationLogTab /></TabsContent>
      </Tabs>
    </PageWrapper>
  );
}
