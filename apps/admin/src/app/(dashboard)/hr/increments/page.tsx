"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Input, EmptyState, Table, TableHeader, TableBody, TableRow,
  TableHead, TableCell, ErrorState, LoadingSpinner, extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface StaffOption { id: string; name_en: string; staff_uid: string; }
interface Increment {
  id: string;
  staff: StaffOption;
  increment_amount: number;
  new_gross_salary: number;
  effective_date: string;
  reason: string | null;
  created_at: string;
}

function fmt(n: number) { return `৳${n.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`; }

export default function SalaryIncrementsPage() {
  const qc = useQueryClient();
  const [staffFilter, setStaffFilter] = useState("");
  const [filterStaffLabel, setFilterStaffLabel] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    staff_id: "", increment_amount: "", new_gross_salary: "",
    effective_date: new Date().toISOString().slice(0, 10), reason: "",
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

  const { data: filterResults } = useQuery<StaffOption[]>({
    queryKey: ["hr", "staff-search-filter", filterSearch],
    queryFn: async () => (await api.get("/api/hr/staff", { params: { search: filterSearch || undefined, limit: 20 } })).data.data,
    enabled: filterSearch.length > 0,
  });

  const { data: increments, isLoading, isError, error, refetch } = useQuery<Increment[]>({
    queryKey: ["hr", "increments", staffFilter],
    queryFn: async () => (await api.get("/api/hr/increments", { params: { staff_id: staffFilter || undefined } })).data.data,
  });

  const addMutation = useMutation({
    mutationFn: () =>
      api.post("/api/hr/increments", {
        staff_id: form.staff_id,
        increment_amount: Number(form.increment_amount),
        new_gross_salary: Number(form.new_gross_salary),
        effective_date: form.effective_date,
        reason: form.reason || undefined,
      }),
    onSuccess: () => {
      toast.success("Salary increment recorded. Salary structure updated automatically.");
      qc.invalidateQueries({ queryKey: ["hr", "increments"] });
      setShowAdd(false);
      setForm({ staff_id: "", increment_amount: "", new_gross_salary: "", effective_date: new Date().toISOString().slice(0, 10), reason: "" });
      setStaffSearch("");
      setSelectedStaff(null);
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Salary Increments"
        subtitle="Track salary raise history. Posting an increment auto-adjusts the staff's salary structure."
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Salary Increments" }]}
        action={<Button size="sm" onClick={() => setShowAdd(true)}>+ Record Increment</Button>}
      />

      <div className="mb-4">
        <label className="text-sm font-medium text-muted-foreground">Filter by staff:</label>
        {staffFilter && filterStaffLabel ? (
          <div className="mt-1 inline-flex items-center gap-2 border rounded-md px-3 py-1.5 text-sm bg-accent/50">
            <span>{filterStaffLabel}</span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { setStaffFilter(""); setFilterStaffLabel(null); setFilterSearch(""); }}
            >
              Clear ✕
            </button>
          </div>
        ) : (
          <div className="relative mt-1 max-w-xs">
            <Input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Search staff by name or ID..." />
            {filterSearch && (
              <div className="absolute z-10 mt-1 w-full border rounded-md bg-background shadow-md max-h-40 overflow-y-auto divide-y">
                {filterResults?.length ? (
                  filterResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-accent/50 text-sm"
                      onClick={() => { setStaffFilter(s.id); setFilterStaffLabel(`${s.name_en} (${s.staff_uid})`); setFilterSearch(""); }}
                    >
                      {s.name_en} <span className="text-muted-foreground text-xs">({s.staff_uid})</span>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No matching staff found.</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : !increments?.length ? (
        <EmptyState title="No increment records" description="Salary increment history will appear here." />
      ) : (
        <Card>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Increment Amount</TableHead>
                  <TableHead>New Gross Salary</TableHead>
                  <TableHead>Effective Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Recorded On</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {increments.map((inc) => (
                  <TableRow key={inc.id}>
                    <TableCell>
                      <div className="font-medium">{inc.staff.name_en}</div>
                      <div className="text-xs text-muted-foreground">{inc.staff.staff_uid}</div>
                    </TableCell>
                    <TableCell className="text-green-700 font-semibold">+{fmt(inc.increment_amount)}</TableCell>
                    <TableCell>{fmt(inc.new_gross_salary)}</TableCell>
                    <TableCell>{new Date(inc.effective_date).toLocaleDateString("en-BD")}</TableCell>
                    <TableCell>{inc.reason ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{new Date(inc.created_at).toLocaleDateString("en-BD")}</TableCell>
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
          <DialogHeader><DialogTitle>Record Salary Increment</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">This will also update the staff&apos;s salary structure immediately.</p>
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
                <label className="text-sm font-medium">Increment Amount (৳)</label>
                <Input type="number" value={form.increment_amount} onChange={(e) => setForm({ ...form, increment_amount: e.target.value })} placeholder="e.g. 2000" />
              </div>
              <div>
                <label className="text-sm font-medium">New Gross Salary (৳)</label>
                <Input type="number" value={form.new_gross_salary} onChange={(e) => setForm({ ...form, new_gross_salary: e.target.value })} placeholder="e.g. 35000" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Effective Date</label>
              <Input type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Reason (optional)</label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Annual appraisal, promotion, etc." />
            </div>
            <Button className="w-full" disabled={addMutation.isPending || !form.staff_id} onClick={() => addMutation.mutate()}>
              {addMutation.isPending ? "Saving..." : "Record Increment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
