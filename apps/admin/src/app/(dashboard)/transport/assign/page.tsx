"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label } from "@education-erp/ui";
import { api } from "@/lib/api";

interface StudentRow {
  id: string;
  name_en: string;
  student_uid: string;
}
interface Route {
  id: string;
  name: string;
  fare: number;
  stops: { id: string; name: string }[];
}

export default function AssignTransportPage() {
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);
  const [routeId, setRouteId] = useState("");
  const [pickupStop, setPickupStop] = useState("");

  const { data: students } = useQuery<StudentRow[]>({
    queryKey: ["students", "search", search],
    queryFn: async () => (await api.get("/api/students", { params: { search, limit: 5 } })).data.data,
    enabled: search.length > 1 && !selectedStudent,
  });

  const { data: routes } = useQuery<Route[]>({ queryKey: ["transport", "routes"], queryFn: async () => (await api.get("/api/transport/routes")).data.data });
  const selectedRoute = routes?.find((r) => r.id === routeId);

  const assignMutation = useMutation({
    mutationFn: () => api.post("/api/transport/assign", { student_id: selectedStudent!.id, route_id: routeId, pickup_stop: pickupStop || undefined }),
    onSuccess: () => {
      toast.success("Student assigned to route");
      setSelectedStudent(null);
      setSearch("");
      setRouteId("");
      setPickupStop("");
    },
    onError: () => toast.error("Failed to assign student"),
  });

  return (
    <PageWrapper>
      <PageHeader title="Assign Student to Route" breadcrumbs={[{ label: "Transport", href: "/transport" }, { label: "Assign" }]} />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label>Student</Label>
            {selectedStudent ? (
              <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{selectedStudent.name_en} ({selectedStudent.student_uid})</span>
                <Button size="sm" variant="outline" onClick={() => setSelectedStudent(null)}>Change</Button>
              </div>
            ) : (
              <>
                <Input placeholder="Search student..." value={search} onChange={(e) => setSearch(e.target.value)} />
                {students?.map((s) => (
                  <button key={s.id} onClick={() => setSelectedStudent(s)} className="block w-full rounded-md border p-2 text-left text-sm hover:bg-accent">
                    {s.name_en} <span className="font-mono text-xs text-muted-foreground">{s.student_uid}</span>
                  </button>
                ))}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Route</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                <option value="">Select...</option>
                {routes?.map((r) => <option key={r.id} value={r.id}>{r.name} (৳{r.fare})</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Pickup Stop</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={pickupStop} onChange={(e) => setPickupStop(e.target.value)} disabled={!selectedRoute}>
                <option value="">Select...</option>
                {selectedRoute?.stops.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <Button disabled={!selectedStudent || !routeId || assignMutation.isPending} onClick={() => assignMutation.mutate()}>
            {assignMutation.isPending ? "Assigning..." : "Assign to Route"}
          </Button>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
