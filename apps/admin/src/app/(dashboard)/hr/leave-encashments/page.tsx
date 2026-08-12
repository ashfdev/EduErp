"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Input, EmptyState, Table, TableHeader, TableBody, TableRow,
  TableHead, TableCell, ErrorState, LoadingSpinner, extractErrorMessage, ConfirmDialog,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface StaffOption { id: string; name_en: string; staff_uid: string; }
interface Encashment {
  id: string;
  staff: StaffOption;
  year: number;
  unused_leaves: number;
  encashed_amount: number;
  date_paid: string;
  created_at: string;
}

function fmt(n: number) { return `৳${n.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`; }

export default function LeaveEncashmentPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState("");
  const [form, setForm] = useState({
    staff_id: "", year: new Date().getFullYear().toString(),
    unused_leaves: "", override_per_day_rate: "", date_paid: new Date().toISOString().slice(0, 10),
  });

  const [staffSearch, setStaffSearch] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<StaffOption | null>(null);

  // Search-driven, not a flat capped list -- this institution has 172 active
  // staff, above the backend's own limit cap, so a "load everyone at once"
  // dropdown would silently hide anyone past the cap.
  const { data: staffResults } = useQuery<StaffOption[]>({
    queryKey: ["hr", "staff-search", staffSearch],
    queryFn: async () => (await api.get("/api/hr/staff", { params: { search: staffSearch || undefined, limit: 20 } })).data.data,
    enabled: showAdd,
  });

  const { data: records, isLoading, isError, error, refetch } = useQuery<Encashment[]>({
    queryKey: ["hr", "leave-encashments", yearFilter],
    queryFn: async () => (await api.get("/api/hr/leave-encashments", { params: { year: yearFilter || undefined } })).data.data,
  });

  const addMutation = useMutation({
    mutationFn: () =>
      api.post("/api/hr/leave-encashments", {
        staff_id: form.staff_id,
        year: Number(form.year),
        unused_leaves: Number(form.unused_leaves),
        date_paid: form.date_paid,
        override_per_day_rate: form.override_per_day_rate ? Number(form.override_per_day_rate) : undefined,
      }),
    onSuccess: (res) => {
      const d = res.data.data;
      toast.success(`Leave encashment processed: ${fmt(d.encashed_amount)} for ${d.unused_leaves} unused leaves`);
      qc.invalidateQueries({ queryKey: ["hr", "leave-encashments"] });
      setShowAdd(false);
      setForm({ staff_id: "", year: new Date().getFullYear().toString(), unused_leaves: "", override_per_day_rate: "", date_paid: new Date().toISOString().slice(0, 10) });
      setStaffSearch("");
      setSelectedStaff(null);
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/hr/leave-encashments/${id}`),
    onSuccess: () => { toast.success("Record deleted"); qc.invalidateQueries({ queryKey: ["hr", "leave-encashments"] }); setDeleteId(null); },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <PageWrapper>
      <PageHeader
        title="Leave Encashment"
        subtitle="Process annual unused leave payouts (Rate: Basic ÷ 26 per day)"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Leave Encashment" }]}
        action={<Button size="sm" onClick={() => setShowAdd(true)}>+ Process Encashment</Button>}
      />

      <div className="flex gap-2 mb-4 items-center">
        <label className="text-sm font-medium text-muted-foreground">Filter by year:</label>
        <select className="border rounded-md px-3 py-1.5 text-sm" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
          <option value="">All Years</option>
          {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : !records?.length ? (
        <EmptyState title="No encashment records" description="Annual leave encashment payouts will appear here." />
      ) : (
        <Card>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Unused Leaves</TableHead>
                  <TableHead>Encashed Amount</TableHead>
                  <TableHead>Date Paid</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.staff.name_en}</div>
                      <div className="text-xs text-muted-foreground">{r.staff.staff_uid}</div>
                    </TableCell>
                    <TableCell>{r.year}</TableCell>
                    <TableCell>{r.unused_leaves} days</TableCell>
                    <TableCell className="font-semibold text-green-700">{fmt(r.encashed_amount)}</TableCell>
                    <TableCell>{new Date(r.date_paid).toLocaleDateString("en-BD")}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="destructive" onClick={() => setDeleteId(r.id)}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={showAdd}
        onOpenChange={(o) => { setShowAdd(o); if (!o) { setStaffSearch(""); setSelectedStaff(null); setForm({ ...form, staff_id: "" }); } }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>Process Leave Encashment</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">Payout = (Basic ÷ 26) × Unused Leaves. You can override the per-day rate if needed.</p>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Staff Member</label>
              {selectedStaff ? (
                <div className="mt-1 flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-accent/50">
                  <span>{selectedStaff.name_en} <span className="text-muted-foreground text-xs">({selectedStaff.staff_uid})</span></span>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => { setSelectedStaff(null); setForm({ ...form, staff_id: "" }); }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <Input value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} placeholder="Search by name or staff ID..." className="mt-1" />
                  <div className="mt-2 border rounded-md max-h-40 overflow-y-auto divide-y">
                    {staffResults?.length ? (
                      staffResults.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-accent/50 text-sm"
                          onClick={() => { setSelectedStaff(s); setForm({ ...form, staff_id: s.id }); }}
                        >
                          {s.name_en} <span className="text-muted-foreground text-xs">({s.staff_uid})</span>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        {staffSearch ? "No matching staff found." : "Start typing to search staff..."}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Year</label>
                <select className="w-full mt-1 border rounded-md px-3 py-2 text-sm" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })}>
                  {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Unused Leave Days</label>
                <Input type="number" value={form.unused_leaves} onChange={(e) => setForm({ ...form, unused_leaves: e.target.value })} placeholder="e.g. 12" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Date Paid</label>
                <Input type="date" value={form.date_paid} onChange={(e) => setForm({ ...form, date_paid: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Override Per-Day Rate (৳) — optional</label>
                <Input type="number" value={form.override_per_day_rate} onChange={(e) => setForm({ ...form, override_per_day_rate: e.target.value })} placeholder="Leave blank to use Basic÷26" />
              </div>
            </div>
            <Button className="w-full" disabled={addMutation.isPending || !form.staff_id} onClick={() => addMutation.mutate()}>
              {addMutation.isPending ? "Processing..." : "Process Encashment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => { if (!o) setDeleteId(null); }}
        title="Delete Encashment Record?"
        description="This permanently removes this encashment record. The payout itself must be reversed manually."
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        loading={deleteMutation.isPending}
      />
    </PageWrapper>
  );
}
