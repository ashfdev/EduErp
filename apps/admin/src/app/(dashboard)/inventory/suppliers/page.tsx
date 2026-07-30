"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, EmptyState, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Input, Label, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
}

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", contact_person: "", phone: "", email: "" });

  const { data, isLoading, isError, error, refetch } = useQuery<Supplier[]>({ queryKey: ["inventory", "suppliers"], queryFn: async () => (await api.get("/api/inventory/suppliers")).data.data });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/inventory/suppliers", form),
    onSuccess: () => {
      toast.success("Supplier added");
      queryClient.invalidateQueries({ queryKey: ["inventory", "suppliers"] });
      setShowNew(false);
      setForm({ name: "", contact_person: "", phone: "", email: "" });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to add supplier"),
  });

  return (
    <PageWrapper>
      <PageHeader title="Suppliers" breadcrumbs={[{ label: "Inventory" }, { label: "Suppliers" }]} action={<Button size="sm" onClick={() => setShowNew(true)}>+ Add Supplier</Button>} />

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : isError ? (
            <ErrorState title="Failed to load suppliers" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
          ) : !data?.length ? <EmptyState title="No suppliers yet" /> : (
            <div className="divide-y">
              {data.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <div><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.contact_person}</p></div>
                  <div className="text-right text-xs text-muted-foreground"><p>{s.phone}</p><p>{s.email}</p></div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Supplier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Contact Person</Label><Input value={form.contact_person} onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={() => createMutation.mutate()} disabled={!form.name}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
