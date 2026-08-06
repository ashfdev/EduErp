"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageHeader, PageWrapper, Switch, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage, ErrorState, LoadingSpinner } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Room {
  id: string;
  name: string;
  capacity: number | null;
  is_lab: boolean;
  is_active: boolean;
}

const emptyForm = { name: "", capacity: "" as number | "", is_lab: false, is_active: true };

export default function RoomsPage() {
  const queryClient = useQueryClient();
  const { data: rooms, isLoading, isError, error, refetch } = useQuery<Room[]>({
    queryKey: ["settings", "rooms"],
    queryFn: async () => (await api.get("/api/settings/rooms")).data.data,
  });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }
  function openEdit(r: Room) {
    setEditingId(r.id);
    setForm({ name: r.name, capacity: r.capacity ?? "", is_lab: r.is_lab, is_active: r.is_active });
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { name: form.name, capacity: form.capacity === "" ? null : Number(form.capacity), is_lab: form.is_lab, is_active: form.is_active };
      return editingId ? api.put(`/api/settings/rooms/${editingId}`, body) : api.post("/api/settings/rooms", body);
    },
    onSuccess: () => {
      toast.success(editingId ? "Room updated" : "Room created");
      queryClient.invalidateQueries({ queryKey: ["settings", "rooms"] });
      setOpen(false);
      setForm(emptyForm);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? (editingId ? "Failed to update room" : "Failed to create room")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/rooms/${id}`),
    onSuccess: () => {
      toast.success("Room removed");
      queryClient.invalidateQueries({ queryKey: ["settings", "rooms"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to remove room"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Rooms"
        subtitle="Physical rooms/labs the routine auto-generator can assign — mark a room as a Lab so subjects flagged &quot;requires a lab&quot; (Settings → Subjects) only get placed there"
        breadcrumbs={[{ label: "Settings" }, { label: "Rooms" }]}
        action={<Button onClick={openCreate}>+ Add Room</Button>}
      />

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load rooms" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
          {!rooms?.length && <EmptyState title="No rooms yet" description="Add at least one lab room here if any subject needs one for routine generation." />}

          {!!rooms?.length && (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Capacity</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rooms.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.capacity ?? "—"}</TableCell>
                        <TableCell><Badge variant={r.is_lab ? "default" : "outline"}>{r.is_lab ? "Lab" : "Regular"}</Badge></TableCell>
                        <TableCell><Badge variant={r.is_active ? "success" : "secondary"}>{r.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => openEdit(r)}>Edit</Button>{" "}
                          <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(r.id)}>Delete</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Room" : "Add Room"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Physics Lab, Room 204" /></div>
            <div className="space-y-1.5"><Label>Capacity (optional)</Label><Input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value === "" ? "" : Number(e.target.value) })} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_lab} onCheckedChange={(v) => setForm({ ...form, is_lab: v })} />
              <Label>This is a lab room</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name}>
              {saveMutation.isPending ? "Saving..." : editingId ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
