"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardHeader, CardTitle, CardContent, Button, Input, Label, EmptyState, extractErrorMessage, ErrorState, LoadingSpinner } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Hall {
  id: string;
  name: string;
  room_number: string | null;
  floor: string | null;
  rows: number;
  seats_per_row: number;
  capacity: number;
}

interface HallDraft {
  name: string;
  room_number: string;
  floor: string;
  rows: string;
  seats_per_row: string;
}

const EMPTY_DRAFT: HallDraft = { name: "", room_number: "", floor: "", rows: "1", seats_per_row: "" };

export default function ExamHallsPage() {
  const queryClient = useQueryClient();
  const { data: halls, isLoading, isError, error, refetch } = useQuery<Hall[]>({
    queryKey: ["exam-halls"],
    queryFn: async () => (await api.get("/api/exam-halls")).data.data,
  });
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<HallDraft>(EMPTY_DRAFT);

  function openCreate() {
    setEditingId("new");
    setDraft(EMPTY_DRAFT);
  }

  function openEdit(h: Hall) {
    setEditingId(h.id);
    setDraft({ name: h.name, room_number: h.room_number ?? "", floor: h.floor ?? "", rows: String(h.rows), seats_per_row: String(h.seats_per_row) });
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: draft.name,
        room_number: draft.room_number || null,
        floor: draft.floor || null,
        rows: Number(draft.rows) || 1,
        seats_per_row: Number(draft.seats_per_row) || 1,
      };
      return editingId === "new" ? api.post("/api/exam-halls", body) : api.put(`/api/exam-halls/${editingId}`, body);
    },
    onSuccess: () => {
      toast.success("Hall saved");
      queryClient.invalidateQueries({ queryKey: ["exam-halls"] });
      setEditingId(null);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to save hall"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/exam-halls/${id}`),
    onSuccess: () => {
      toast.success("Hall removed");
      queryClient.invalidateQueries({ queryKey: ["exam-halls"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to remove hall"),
  });

  const draftCapacity = (Number(draft.rows) || 0) * (Number(draft.seats_per_row) || 0);

  return (
    <PageWrapper>
      <PageHeader
        title="Exam Halls"
        subtitle="Define each physical hall/room once (room number, floor, rows × seats-per-row) — reused across every future exam's seat-plan generation."
        breadcrumbs={[{ label: "Examination", href: "/examination" }, { label: "Halls" }]}
        action={<Button onClick={openCreate}>+ New Hall</Button>}
      />

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load exam halls" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
      {!halls?.length && <EmptyState title="No halls defined yet" description="Add one before generating a seat plan." />}

      <div className="grid grid-cols-3 gap-4">
        {halls?.map((h) => (
          <Card key={h.id}>
            <CardHeader><CardTitle className="text-base">{h.name}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {[h.room_number && `Room ${h.room_number}`, h.floor].filter(Boolean).join(" · ") || "No room/floor set"}
              </p>
              <p className="text-sm text-muted-foreground">
                {h.rows} row{h.rows === 1 ? "" : "s"} × {h.seats_per_row} seat{h.seats_per_row === 1 ? "" : "s"}/row — capacity {h.capacity}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(h)}>Edit</Button>
                <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(h.id)}>Delete</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
        </>
      )}

      {editingId && (
        <Card>
          <CardHeader><CardTitle>{editingId === "new" ? "New Hall" : `Editing: ${draft.name}`}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 max-w-2xl">
              <div className="space-y-1.5">
                <Label>Hall Name</Label>
                <Input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Main Hall" />
              </div>
              <div className="space-y-1.5">
                <Label>Room Number</Label>
                <Input value={draft.room_number} onChange={(e) => setDraft((p) => ({ ...p, room_number: e.target.value }))} placeholder="e.g. 101" />
              </div>
              <div className="space-y-1.5">
                <Label>Floor</Label>
                <Input value={draft.floor} onChange={(e) => setDraft((p) => ({ ...p, floor: e.target.value }))} placeholder="e.g. 2nd Floor" />
              </div>
              <div />
              <div className="space-y-1.5">
                <Label>Rows</Label>
                <Input type="number" min={1} value={draft.rows} onChange={(e) => setDraft((p) => ({ ...p, rows: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Seats per Row</Label>
                <Input type="number" min={1} value={draft.seats_per_row} onChange={(e) => setDraft((p) => ({ ...p, seats_per_row: e.target.value }))} placeholder="e.g. 6" />
              </div>
            </div>
            {draftCapacity > 0 && <p className="text-sm text-muted-foreground">Total capacity: {draftCapacity} seats</p>}

            <div className="flex gap-2">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !draft.name.trim() || !Number(draft.seats_per_row)}>
                {saveMutation.isPending ? "Saving..." : "Save Hall"}
              </Button>
              <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </PageWrapper>
  );
}
