"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PortalShell } from "@/components/portal-shell";
import { api } from "@/lib/api";
import { Card, CardContent, Badge, Button, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, LoadingSpinner, EmptyState } from "@education-erp/ui";

interface ComplaintRow {
  id: string;
  category: string;
  description: string;
  status: string;
  created_at: string;
}

function ComplaintsContent() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ category: "ACADEMIC", description: "" });

  const { data, isLoading } = useQuery<ComplaintRow[]>({
    queryKey: ["portal", "complaints"],
    queryFn: async () => (await api.get("/api/portal/complaints")).data.data,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/portal/complaints", draft),
    onSuccess: () => {
      toast.success("Complaint submitted");
      queryClient.invalidateQueries({ queryKey: ["portal", "complaints"] });
      setOpen(false);
      setDraft({ category: "ACADEMIC", description: "" });
    },
  });

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Complaints</h1>
        <Button size="sm" onClick={() => setOpen(true)}>+ Raise</Button>
      </div>

      {!data?.length && <EmptyState title="No complaints raised yet" />}
      {data?.map((c) => (
        <Card key={c.id}>
          <CardContent className="space-y-1 pt-6">
            <div className="flex items-center justify-between">
              <Badge variant="outline">{c.category}</Badge>
              <Badge variant={c.status === "RESOLVED" || c.status === "CLOSED" ? "default" : "outline"}>{c.status}</Badge>
            </div>
            <p className="text-sm">{c.description}</p>
            <p className="text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString()}</p>
          </CardContent>
        </Card>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Raise a Complaint</DialogTitle></DialogHeader>
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
    </div>
  );
}

export default function ComplaintsPage() {
  return (
    <PortalShell>
      <ComplaintsContent />
    </PortalShell>
  );
}
