"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, EmptyState, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
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

  const { data: events, isLoading, isError, error, refetch } = useQuery<EventItem[]>({ queryKey: ["website", "events"], queryFn: async () => (await api.get("/api/website/events")).data.data });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/website/events", { name, date_from: dateFrom, date_to: dateTo || undefined, type }),
    onSuccess: () => {
      toast.success("Event added");
      queryClient.invalidateQueries({ queryKey: ["website", "events"] });
      setOpen(false);
      setName(""); setDateFrom(""); setDateTo("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to add event"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/website/events/${id}`),
    onSuccess: () => {
      toast.success("Event removed");
      queryClient.invalidateQueries({ queryKey: ["website", "events"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to remove event"),
  });

  return (
    <PageWrapper>
      <PageHeader title="Events / Academic Calendar" breadcrumbs={[{ label: "Website" }, { label: "Events" }]} action={<Button onClick={() => setOpen(true)}>+ Add Event</Button>} />

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load events" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
          {!events?.length && <EmptyState title="No events yet" />}
          {!!events?.length && (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Name</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Type</TableHead><TableHead>Actions</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{e.name}</TableCell>
                        <TableCell>{new Date(e.date_from).toLocaleDateString()}</TableCell>
                        <TableCell>{e.date_to ? new Date(e.date_to).toLocaleDateString() : "-"}</TableCell>
                        <TableCell>{e.type}</TableCell>
                        <TableCell><Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(e.id)}>Delete</Button></TableCell>
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
