"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
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
interface ClassOption {
  id: string;
  name_en: string;
  sections?: { id: string; name: string }[];
}
interface FeeStructureOption {
  id: string;
  name: string;
  amount: number;
  category: string;
  is_active: boolean;
}

export default function AssignTransportPage() {
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [pickupStop, setPickupStop] = useState("");
  // Real bug fixed (Plan Twenty-Seven, Bug 2a): this form never sent
  // fee_structure_id even though the backend has always correctly supported
  // it -- every real-world assignment made here fell into the legacy
  // one-off-invoice branch, which hardcodes due_date to today instead of
  // the fee structure's own "due by the Nth of the month" rule. Picking a
  // structure here routes through attachFeeStructureToStudent(), the same
  // correctly-recurring mechanism the Facility Request approval flow uses.
  const [feeStructureId, setFeeStructureId] = useState("");

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const selectedClass = classes?.find((c) => c.id === classId);

  const { data: students } = useQuery<StudentRow[]>({
    queryKey: ["students", "search", search, classId, sectionId],
    queryFn: async () =>
      (
        await api.get("/api/students", {
          params: { search, class_id: classId || undefined, section_id: sectionId || undefined, limit: 5 },
        })
      ).data.data,
    enabled: search.length > 1 && !selectedStudent,
  });

  const { data: routes, isLoading: routesLoading, isError: routesError, error: routesErrorObj, refetch: refetchRoutes } = useQuery<Route[]>({ queryKey: ["transport", "routes"], queryFn: async () => (await api.get("/api/transport/routes")).data.data });
  const selectedRoute = routes?.find((r) => r.id === routeId);

  const { data: structures } = useQuery<FeeStructureOption[]>({
    queryKey: ["fees", "structures"],
    queryFn: async () => (await api.get("/api/fees/structures")).data.data,
  });
  const transportStructures = structures?.filter((s) => s.category === "TRANSPORT" && s.is_active) ?? [];

  const assignMutation = useMutation({
    mutationFn: () =>
      api.post("/api/transport/assign", {
        student_id: selectedStudent!.id,
        route_id: routeId,
        pickup_stop: pickupStop || undefined,
        fee_structure_id: feeStructureId || undefined,
      }),
    onSuccess: () => {
      toast.success("Student assigned to route");
      setSelectedStudent(null);
      setSearch("");
      setClassId("");
      setSectionId("");
      setRouteId("");
      setPickupStop("");
      setFeeStructureId("");
    },
    onError: () => toast.error("Failed to assign student"),
  });

  return (
    <PageWrapper>
      <PageHeader title="Assign Student to Route" breadcrumbs={[{ label: "Transport", href: "/transport" }, { label: "Assign" }]} />

      {routesLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : routesError ? (
        <ErrorState title="Failed to load transport routes" description={extractErrorMessage(routesErrorObj)} retryLabel="Retry" onRetry={() => refetchRoutes()} />
      ) : (
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
                <div className="flex gap-2">
                  <Select value={classId || "all"} onValueChange={(v) => { setClassId(v === "all" ? "" : v); setSectionId(""); }}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="All Classes" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Classes</SelectItem>
                      {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={sectionId || "all"} onValueChange={(v) => setSectionId(v === "all" ? "" : v)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="All Sections" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sections</SelectItem>
                      {selectedClass?.sections?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
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

          <div className="space-y-1.5">
            <Label>Fee Structure (recurring, billed by its own due-date rule)</Label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={feeStructureId} onChange={(e) => setFeeStructureId(e.target.value)}>
              <option value="">No recurring fee — one-off invoice for the route&apos;s flat fare only</option>
              {transportStructures.map((s) => (
                <option key={s.id} value={s.id}>{s.name} — ৳{s.amount}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {transportStructures.length === 0
                ? "No active Transport fee structures configured yet — set one up under Fees → Structures to bill this route monthly instead of a one-off flat fare."
                : "Picking a structure here bills this student going forward per that structure's own recurring due-date rule, instead of a single flat invoice due today."}
            </p>
          </div>

          <Button disabled={!selectedStudent || !routeId || assignMutation.isPending} onClick={() => assignMutation.mutate()}>
            {assignMutation.isPending ? "Assigning..." : "Assign to Route"}
          </Button>
        </CardContent>
      </Card>
      )}
    </PageWrapper>
  );
}
