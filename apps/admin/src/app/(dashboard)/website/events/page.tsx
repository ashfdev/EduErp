"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, EmptyState, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@education-erp/ui";
import { EVENT_TYPES } from "@education-erp/types";
import { api } from "@/lib/api";

interface EventItem {
  id: string;
  name: string;
  date_from: string;
  date_to: string | null;
  type: string;
  is_public: boolean;
}

export default function EventsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [type, setType] = useState("GENERAL");

  const { data: events } = useQuery<EventItem[]>({ queryKey: ["website", "events"], queryFn: async () => (await api.get("/api/website/events")).data.data });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/website/events", { name, date_from: dateFrom, date_to: dateTo || undefined, type }),
    onSuccess: () => {
      toast.success("Event added");
      queryClient.invalidateQueries({ queryKey: ["website", "events"] });
      setOpen(false);
      setName(""); setDateFrom(""); setDateTo("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/website/events/${id}`),
    onSuccess: () => {
      toast.success("Event removed");
      queryClient.invalidateQueries({ queryKey: ["website", "events"] });
    },
  });

  return (
    <PageWrapper>
      <PageHeader title="Events / Academic Calendar" breadcrumbs={[{ label: "Website" }, { label: "Events" }]} action={<Button onClick={() => setOpen(true)}>+ Add Event</Button>} />

      {!events?.length && <EmptyState title="No events yet" />}
      {!!events?.length && (
        <Card>
          <CardContent className="pt-6">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Name</th><th className="p-2">From</th><th className="p-2">To</th><th className="p-2">Type</th><th className="p-2">Actions</th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b">
                    <td className="p-2">{e.name}</td>
                    <td className="p-2">{new Date(e.date_from).toLocaleDateString()}</td>
                    <td className="p-2">{e.date_to ? new Date(e.date_to).toLocaleDateString() : "-"}</td>
                    <td className="p-2">{e.type}</td>
                    <td className="p-2"><Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(e.id)}>Delete</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Event</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Date From</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Date To (optional)</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((et) => <SelectItem key={et} value={et}>{et}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!name || !dateFrom || createMutation.isPending} onClick={() => createMutation.mutate()}>Add Event</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
