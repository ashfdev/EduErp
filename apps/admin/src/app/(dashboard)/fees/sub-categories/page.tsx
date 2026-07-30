"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, ErrorState, Input, Label, LoadingSpinner, Badge, Switch, EmptyState, extractErrorMessage,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@education-erp/ui";
import { api } from "@/lib/api";

const CATEGORIES = ["ADMISSION", "FORM", "READMISSION", "TUITION", "EXAM", "TRANSPORT", "HOSTEL", "LAB", "LIBRARY", "SPORTS", "DEVELOPMENT", "OTHER"];

interface SubCategory {
  id: string;
  category: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export default function FeeSubCategoriesPage() {
  const queryClient = useQueryClient();
  const { data: subCategories, isLoading, isError, error, refetch } = useQuery<SubCategory[]>({
    queryKey: ["fees", "sub-categories"],
    queryFn: async () => (await api.get("/api/fees/sub-categories")).data.data,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "TUITION", name: "", description: "" });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/fees/sub-categories", form),
    onSuccess: () => {
      toast.success("Fee sub-category created");
      queryClient.invalidateQueries({ queryKey: ["fees", "sub-categories"] });
      setOpen(false);
      setForm({ category: "TUITION", name: "", description: "" });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to create sub-category"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => api.put(`/api/fees/sub-categories/${id}`, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fees", "sub-categories"] }),
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to update"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Fee Sub-Categories"
        subtitle="Finer-grained catalog entries nested under a Fee Category (e.g. Tuition → Lab Fee)"
        breadcrumbs={[{ label: "Fees", href: "/fees" }, { label: "Sub-Categories" }]}
        action={<Button onClick={() => setOpen(true)}>+ Add Sub-Category</Button>}
      />

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load fee sub-categories" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
      {!subCategories?.length && <EmptyState title="No fee sub-categories yet" description="Create one to enable finer-grained fee structures, fine rules, and reporting." />}
      {!!subCategories?.length && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subCategories.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell><Badge variant="outline">{s.category}</Badge></TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.description ?? "—"}</TableCell>
                    <TableCell>{s.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Switch checked={s.is_active} onCheckedChange={(v) => toggleActiveMutation.mutate({ id: s.id, is_active: v })} />
                      </div>
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
          <DialogHeader><DialogTitle>Add Fee Sub-Category</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Fee Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Lab Fee" /></div>
            <div className="space-y-1.5"><Label>Description (optional)</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button disabled={!form.name || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
