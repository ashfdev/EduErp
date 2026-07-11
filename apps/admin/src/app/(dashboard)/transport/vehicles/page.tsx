"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Badge, EmptyState,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface Route {
  id: string;
  name: string;
}
interface Vehicle {
  id: string;
  route_id: string | null;
  vehicle_no: string;
  type: string;
  capacity: number;
  driver_name: string | null;
  driver_phone: string | null;
  is_active: boolean;
  has_device_key: boolean;
  route: { name: string } | null;
}

export default function VehiclesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ vehicle_no: "", type: "Bus", capacity: 40, driver_name: "", driver_phone: "", route_id: "" });
  const [revealedKey, setRevealedKey] = useState<{ vehicle_no: string; key: string } | null>(null);

  const { data: vehicles } = useQuery<Vehicle[]>({ queryKey: ["transport", "vehicles"], queryFn: async () => (await api.get("/api/transport/vehicles")).data.data });
  const { data: routes } = useQuery<Route[]>({ queryKey: ["transport", "routes"], queryFn: async () => (await api.get("/api/transport/routes")).data.data });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/api/transport/vehicles", {
        vehicle_no: form.vehicle_no,
        type: form.type,
        capacity: form.capacity,
        driver_name: form.driver_name || undefined,
        driver_phone: form.driver_phone || undefined,
        route_id: form.route_id || undefined,
      }),
    onSuccess: () => {
      toast.success("Vehicle added");
      setForm({ vehicle_no: "", type: "Bus", capacity: 40, driver_name: "", driver_phone: "", route_id: "" });
      queryClient.invalidateQueries({ queryKey: ["transport", "vehicles"] });
    },
    onError: () => toast.error("Failed to add vehicle"),
  });

  const issueKeyMutation = useMutation({
    mutationFn: (vehicleId: string) => api.post(`/api/transport/vehicles/${vehicleId}/device-key`),
    onSuccess: (res, vehicleId) => {
      const v = vehicles?.find((x) => x.id === vehicleId);
      setRevealedKey({ vehicle_no: v?.vehicle_no ?? "", key: res.data.data.device_api_key });
      queryClient.invalidateQueries({ queryKey: ["transport", "vehicles"] });
    },
    onError: () => toast.error("Failed to issue device key"),
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (vehicleId: string) => api.delete(`/api/transport/vehicles/${vehicleId}/device-key`),
    onSuccess: () => {
      toast.success("Device key revoked");
      queryClient.invalidateQueries({ queryKey: ["transport", "vehicles"] });
    },
  });

  return (
    <PageWrapper>
      <PageHeader title="Vehicles & Live Tracking" breadcrumbs={[{ label: "Transport", href: "/transport" }, { label: "Vehicles" }]} />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="font-medium">Add Vehicle</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5"><Label>Vehicle No.</Label><Input value={form.vehicle_no} onChange={(e) => setForm((f) => ({ ...f, vehicle_no: e.target.value }))} placeholder="Dhaka Metro-Cha-12-3456" /></div>
            <div className="space-y-1.5"><Label>Type</Label><Input value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Capacity</Label><Input type="number" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))} /></div>
            <div className="space-y-1.5"><Label>Driver Name</Label><Input value={form.driver_name} onChange={(e) => setForm((f) => ({ ...f, driver_name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Driver Phone</Label><Input value={form.driver_phone} onChange={(e) => setForm((f) => ({ ...f, driver_phone: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label>Route</Label>
              <Select value={form.route_id} onValueChange={(v) => setForm((f) => ({ ...f, route_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  {routes?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button disabled={!form.vehicle_no || createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? "Adding..." : "Add Vehicle"}
          </Button>
        </CardContent>
      </Card>

      {!vehicles?.length && <EmptyState title="No vehicles added yet" />}
      <div className="space-y-3">
        {vehicles?.map((v) => (
          <Card key={v.id}>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="font-medium">{v.vehicle_no} <span className="text-sm text-muted-foreground">({v.type})</span></p>
                <p className="text-sm text-muted-foreground">{v.route?.name ?? "No route"} · Driver: {v.driver_name ?? "N/A"}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={v.has_device_key ? "default" : "outline"}>{v.has_device_key ? "Tracker linked" : "No device key"}</Badge>
                <Button variant="outline" size="sm" onClick={() => issueKeyMutation.mutate(v.id)} disabled={issueKeyMutation.isPending}>
                  {v.has_device_key ? "Rotate Key" : "Issue Key"}
                </Button>
                {v.has_device_key && (
                  <Button variant="outline" size="sm" onClick={() => revokeKeyMutation.mutate(v.id)}>Revoke</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!revealedKey} onOpenChange={(open) => !open && setRevealedKey(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Device Key — {revealedKey?.vehicle_no}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Copy this now and configure it on the vehicle&apos;s GPS unit. It will not be shown again — issuing a new key
            will invalidate this one.
          </p>
          <code className="block rounded-md bg-muted p-3 text-sm break-all">{revealedKey?.key}</code>
          <DialogFooter>
            <Button onClick={() => { navigator.clipboard.writeText(revealedKey?.key ?? ""); toast.success("Copied"); }}>Copy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
