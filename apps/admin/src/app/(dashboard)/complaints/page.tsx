"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  Button,
  Input,
  Label,
  Badge,
  EmptyState,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface ComplaintRow {
  id: string;
  category: string;
  description: string;
  status: string;
  resolution_notes?: string | null;
  created_at: string;
}

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export default function ComplaintsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ category: "ACADEMIC", description: "" });
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolveDraft, setResolveDraft] = useState({ status: "RESOLVED", resolution_notes: "" });

  const { data: complaints } = useQuery<ComplaintRow[]>({
    queryKey: ["complaints"],
    queryFn: async () => (await api.get("/api/complaints")).data.data,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/complaints", draft),
    onSuccess: () => {
      toast.success("Complaint submitted");
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      setOpen(false);
      setDraft({ category: "ACADEMIC", description: "" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => api.put(`/api/complaints/${resolveId}`, resolveDraft),
    onSuccess: () => {
      toast.success("Complaint updated");
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      setResolveId(null);
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Only ADMIN/PRINCIPAL can update status";
      toast.error(message);
    },
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Complaints"
        subtitle="Raise or manage complaints and grievances"
        breadcrumbs={[{ label: "Complaints" }]}
        action={<Button onClick={() => setOpen(true)}>+ Raise Complaint</Button>}
      />

      {!complaints?.length && <EmptyState title="No complaints" />}

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-2">Date</th>
                <th className="p-2">Category</th>
                <th className="p-2">Description</th>
                <th className="p-2">Status</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {complaints?.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="p-2 text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="p-2"><Badge variant="outline">{c.category}</Badge></td>
                  <td className="p-2">{c.description}</td>
                  <td className="p-2"><Badge variant={c.status === "RESOLVED" || c.status === "CLOSED" ? "default" : "outline"}>{c.status}</Badge></td>
                  <td className="p-2">
                    <Button size="sm" variant="outline" onClick={() => { setResolveId(c.id); setResolveDraft({ status: c.status === "OPEN" ? "IN_PROGRESS" : "RESOLVED", resolution_notes: c.resolution_notes ?? "" }); }}>
                      Update
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Raise Complaint</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={draft.category} onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}>
                <option value="ACADEMIC">Academic</option>
                <option value="FACILITY">Facility</option>
                <option value="STAFF_CONDUCT">Staff Conduct</option>
                <option value="BULLYING">Bullying</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !draft.description}>Submit</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resolveId} onOpenChange={(o) => !o && setResolveId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Complaint</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={resolveDraft.status} onChange={(e) => setResolveDraft((p) => ({ ...p, status: e.target.value }))}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Resolution Notes</Label><Input value={resolveDraft.resolution_notes} onChange={(e) => setResolveDraft((p) => ({ ...p, resolution_notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
