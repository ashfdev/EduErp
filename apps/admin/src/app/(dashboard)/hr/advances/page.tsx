"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Input, EmptyState, Table, TableHeader, TableBody, TableRow,
  TableHead, TableCell, ErrorState, LoadingSpinner, extractErrorMessage, ConfirmDialog,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface StaffOption { id: string; name_en: string; staff_uid: string; }
interface Advance {
  id: string;
  staff: StaffOption;
  amount: number;
  amount_cleared: number;
  monthly_emi: number | null;
  reason: string | null;
  date_given: string;
  status: "PENDING" | "PARTIAL" | "CLEARED";
}

const statusColor = {
  PENDING: "destructive" as const,
  PARTIAL: "warning" as const,
  CLEARED: "success" as const,
};

function fmt(n: number) {
  return `৳${n.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
}

export default function AdvancesPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({ staff_id: "", amount: "", monthly_emi: "", reason: "", date_given: new Date().toISOString().slice(0, 10) });
  const [staffSearch, setStaffSearch] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<StaffOption | null>(null);

  // Search-driven, not a flat capped list -- this institution has 172 active
  // staff, above the backend's own limit cap, so a "load everyone at once"
  // dropdown would silently hide anyone past the cap. Same type-to-search
  // pattern already used for students on the Alumni/Sibling Groups pages.
  const { data: staffResults } = useQuery<StaffOption[]>({
    queryKey: ["hr", "staff-search", staffSearch],
    queryFn: async () => (await api.get("/api/hr/staff", { params: { search: staffSearch || undefined, limit: 20 } })).data.data,
    enabled: showAdd,
  });

  const { data: advances, isLoading, isError, error, refetch } = useQuery<Advance[]>({
    queryKey: ["hr", "advances", statusFilter],
    queryFn: async () => (await api.get("/api/hr/advances", { params: { status: statusFilter || undefined } })).data.data,
  });

  const addMutation = useMutation({
    mutationFn: () =>
      api.post("/api/hr/advances", {
        staff_id: form.staff_id,
        amount: Number(form.amount),
        monthly_emi: form.monthly_emi ? Number(form.monthly_emi) : undefined,
        reason: form.reason || undefined,
        date_given: form.date_given,
      }),
    onSuccess: () => {
      toast.success("Advance registered");
      qc.invalidateQueries({ queryKey: ["hr", "advances"] });
      setShowAdd(false);
      setForm({ staff_id: "", amount: "", monthly_emi: "", reason: "", date_given: new Date().toISOString().slice(0, 10) });
      setStaffSearch("");
      setSelectedStaff(null);
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/hr/advances/${id}`),
    onSuccess: () => { toast.success("Advance deleted"); qc.invalidateQueries({ queryKey: ["hr", "advances"] }); setDeleteId(null); },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Staff Advances"
        subtitle="Track salary advances (loans) given to staff"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Advances" }]}
        action={<Button size="sm" onClick={() => setShowAdd(true)}>+ New Advance</Button>}
      />

      <div className="flex gap-2 mb-4">
        {(["", "PENDING", "PARTIAL", "CLEARED"] as const).map((s) => (
          <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)}>
            {s === "" ? "All" : s}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load advances" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : !advances?.length ? (
        <EmptyState title="No advances found" description="Advance loans given to staff will appear here." />
      ) : (
        <Card>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Cleared</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Monthly EMI</TableHead>
                  <TableHead>Date Given</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {advances.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.staff.name_en}</div>
                      <div className="text-xs text-muted-foreground">{a.staff.staff_uid}</div>
                    </TableCell>
                    <TableCell>{fmt(a.amount)}</TableCell>
                    <TableCell className="text-green-600">{fmt(a.amount_cleared)}</TableCell>
                    <TableCell className="text-red-600">{fmt(a.amount - a.amount_cleared)}</TableCell>
                    <TableCell>{a.monthly_emi ? fmt(a.monthly_emi) : "—"}</TableCell>
                    <TableCell>{new Date(a.date_given).toLocaleDateString("en-BD")}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{a.reason ?? "—"}</TableCell>
                    <TableCell><Badge variant={statusColor[a.status]}>{a.status}</Badge></TableCell>
                    <TableCell>
                      {a.status === "PENDING" && (
                        <Button size="sm" variant="destructive" onClick={() => setDeleteId(a.id)}>Delete</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Add Advance Dialog */}
      <Dialog
        open={showAdd}
        onOpenChange={(o) => { setShowAdd(o); if (!o) { setStaffSearch(""); setSelectedStaff(null); setForm({ ...form, staff_id: "" }); } }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>Register New Advance</DialogTitle></DialogHeader>
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
                <label className="text-sm font-medium">Advance Amount (৳)</label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="e.g. 10000" />
              </div>
              <div>
                <label className="text-sm font-medium">Monthly EMI (৳) — optional</label>
                <Input type="number" value={form.monthly_emi} onChange={(e) => setForm({ ...form, monthly_emi: e.target.value })} placeholder="e.g. 2000" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Date Given</label>
              <Input type="date" value={form.date_given} onChange={(e) => setForm({ ...form, date_given: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Reason (optional)</label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Medical emergency, etc." />
            </div>
            <Button className="w-full" disabled={addMutation.isPending || !form.staff_id} onClick={() => addMutation.mutate()}>
              {addMutation.isPending ? "Saving..." : "Register Advance"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => { if (!o) setDeleteId(null); }}
        title="Delete Advance?"
        description="This will permanently delete the advance record. Only PENDING advances (no deduction made yet) can be deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        loading={deleteMutation.isPending}
      />
    </PageWrapper>
  );
}
