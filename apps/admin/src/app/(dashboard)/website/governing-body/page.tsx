"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, EmptyState, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Member {
  id: string;
  name: string;
  designation: string;
  group: string;
  photo_url: string | null;
  display_order: number;
}

export default function GoverningBodyPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [group, setGroup] = useState("Governing Body");

  const { data: members, isLoading, isError, error, refetch } = useQuery<Member[]>({ queryKey: ["website", "governing-body"], queryFn: async () => (await api.get("/api/website/governing-body")).data.data });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/website/governing-body", { name, designation, group }),
    onSuccess: () => {
      toast.success("Member added");
      queryClient.invalidateQueries({ queryKey: ["website", "governing-body"] });
      setOpen(false);
      setName(""); setDesignation("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to add member"),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; display_order: number }[]) => api.put("/api/website/governing-body/reorder", items),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["website", "governing-body"] }),
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to reorder members"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/website/governing-body/${id}`),
    onSuccess: () => {
      toast.success("Member removed");
      queryClient.invalidateQueries({ queryKey: ["website", "governing-body"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to remove member"),
  });

  function move(index: number, dir: -1 | 1) {
    if (!members) return;
    const arr = [...members];
    const target = index + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[index], arr[target]] = [arr[target]!, arr[index]!];
    reorderMutation.mutate(arr.map((m, i) => ({ id: m.id, display_order: i })));
  }

  return (
    <PageWrapper>
      <PageHeader title="Governing Body" breadcrumbs={[{ label: "Website" }, { label: "Governing Body" }]} action={<Button onClick={() => setOpen(true)}>+ Add Member</Button>} />

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load governing body members" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
          {!members?.length && <EmptyState title="No members added yet" />}
          <div className="space-y-2">
            {members?.map((m, i) => (
              <Card key={m.id}>
                <CardContent className="flex items-center justify-between pt-6">
                  <div>
                    <p className="font-medium">{m.name}</p>
                    <p className="text-sm text-muted-foreground">{m.designation} · {m.group}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => move(i, -1)}>↑</Button>
                    <Button size="sm" variant="outline" onClick={() => move(i, 1)}>↓</Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(m.id)}>Delete</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Governing Body Member</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Designation</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Group</Label><Input value={group} onChange={(e) => setGroup(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button disabled={!name || !designation || createMutation.isPending} onClick={() => createMutation.mutate()}>Add Member</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
