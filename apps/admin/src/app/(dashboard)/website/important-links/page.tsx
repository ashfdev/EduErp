"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, EmptyState, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@education-erp/ui";
import { api } from "@/lib/api";

interface LinkRow {
  id: string;
  title: string;
  url: string;
  display_order: number;
  is_active: boolean;
}

const emptyForm = { title: "", url: "", display_order: 0 };

export default function ImportantLinksPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: links } = useQuery<LinkRow[]>({
    queryKey: ["website", "important-links"],
    queryFn: async () => (await api.get("/api/website/important-links")).data.data,
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }
  function openEdit(l: LinkRow) {
    setEditingId(l.id);
    setForm({ title: l.title, url: l.url, display_order: l.display_order });
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => (editingId ? api.put(`/api/website/important-links/${editingId}`, form) : api.post("/api/website/important-links", form)),
    onSuccess: () => {
      toast.success(editingId ? "Link updated" : "Link added");
      queryClient.invalidateQueries({ queryKey: ["website", "important-links"] });
      setOpen(false);
    },
    onError: () => toast.error("Failed to save link — check the URL is valid"),
  });

  const toggleMutation = useMutation({
    mutationFn: (l: LinkRow) => api.put(`/api/website/important-links/${l.id}`, { is_active: !l.is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["website", "important-links"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/website/important-links/${id}`),
    onSuccess: () => {
      toast.success("Link removed");
      queryClient.invalidateQueries({ queryKey: ["website", "important-links"] });
    },
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Important Links"
        subtitle="External links shown in the public website footer — education board, ministry, UGC, etc."
        breadcrumbs={[{ label: "Website" }, { label: "Important Links" }]}
        action={<Button onClick={openCreate}>+ Add Link</Button>}
      />

      {!links?.length && <EmptyState title="No important links yet" />}
      {!!links?.length && (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.display_order}</TableCell>
                    <TableCell>{l.title}</TableCell>
                    <TableCell><a href={l.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{l.url}</a></TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate(l)}>{l.is_active ? "Active" : "Inactive"}</Button>
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => openEdit(l)}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(l.id)}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Link" : "Add Link"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Dhaka Education Board" /></div>
            <div className="space-y-1.5"><Label>URL</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." /></div>
            <div className="space-y-1.5"><Label>Display Order</Label><Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })} /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.title || !form.url}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
