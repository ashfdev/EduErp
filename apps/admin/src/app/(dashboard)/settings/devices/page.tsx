"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, StatusBadge, EmptyState,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Table, TableBody, TableRow, TableCell,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface Device {
  id: string;
  name: string;
  type: string;
  brand: string | null;
  serial_number: string | null;
  location: string | null;
  ip_address: string | null;
  status: string;
  last_sync_at: string | null;
  is_active: boolean;
  _count: { punch_logs: number };
}

interface PunchLog {
  id: string;
  device_user_id: string;
  punch_at: string;
  is_processed: boolean;
  mapped_person_id: string | null;
}

function statusColor(status: string) {
  if (status === "ONLINE") return "bg-green-500";
  if (status === "ERROR") return "bg-red-500";
  return "bg-gray-400";
}

function DeviceCard({ device }: { device: Device }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showUnmapped, setShowUnmapped] = useState(false);

  const { data: logs } = useQuery<PunchLog[]>({
    queryKey: ["devices", device.id, "punch-logs"],
    queryFn: async () => (await api.get(`/api/devices/${device.id}/punch-logs`, { params: { limit: 20 } })).data.data,
    enabled: showLogs,
  });

  const { data: unmapped } = useQuery<PunchLog[]>({
    queryKey: ["devices", device.id, "unmapped"],
    queryFn: async () => (await api.get(`/api/devices/${device.id}/unmapped`)).data.data,
    enabled: showUnmapped,
  });

  const testMutation = useMutation({
    mutationFn: () => api.post(`/api/devices/${device.id}/test-connection`),
    onSuccess: (res) => toast[res.data.data.online ? "success" : "error"](res.data.data.online ? "Device is online" : "Device appears offline"),
  });

  const syncNowMutation = useMutation({
    mutationFn: () => api.post(`/api/devices/${device.id}/sync-now`),
    onSuccess: (res) => {
      toast.success(`Reconciled: ${res.data.data.resolved}/${res.data.data.retried} punches resolved`);
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
    onError: () => toast.error("Device service is not reachable"),
  });

  const syncUsersMutation = useMutation({
    mutationFn: () => api.post(`/api/devices/${device.id}/sync-users`),
    onSuccess: (res) => toast.success(`Queued ${res.data.data.queued}/${res.data.data.total} users for sync`),
    onError: () => toast.error("Device service is not reachable or device has no serial number"),
  });

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${statusColor(device.status)} ${device.status === "ONLINE" ? "animate-pulse" : ""}`} />
            <div>
              <p className="font-medium">{device.name}</p>
              <p className="text-xs text-muted-foreground">{device.type} · {device.location ?? "No location"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={device.status} />
            <Button size="sm" variant="outline" onClick={() => setExpanded((e) => !e)}>{expanded ? "Collapse" : "Details"}</Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3 border-t pt-4 text-sm">
            <p>Serial Number: {device.serial_number ?? "Not set"}</p>
            <p>IP Address: {device.ip_address ?? "—"}</p>
            <p>Last Sync: {device.last_sync_at ? new Date(device.last_sync_at).toLocaleString() : "Never"}</p>
            <p>Punch Logs: {device._count.punch_logs}</p>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={testMutation.isPending} onClick={() => testMutation.mutate()}>Test Connection</Button>
              <Button size="sm" variant="outline" disabled={syncNowMutation.isPending} onClick={() => syncNowMutation.mutate()}>Sync Now</Button>
              <Button size="sm" variant="outline" disabled={syncUsersMutation.isPending} onClick={() => syncUsersMutation.mutate()}>Sync Users</Button>
              <Button size="sm" variant="outline" onClick={() => setShowLogs((s) => !s)}>{showLogs ? "Hide" : "View"} Punch Logs</Button>
              <Button size="sm" variant="outline" onClick={() => setShowUnmapped((s) => !s)}>{showUnmapped ? "Hide" : "View"} Unmapped</Button>
            </div>

            {showLogs && (
              <div className="max-h-48 overflow-y-auto rounded-md border">
                {!logs?.length && <p className="p-2 text-xs text-muted-foreground">No punch logs yet.</p>}
                <Table className="text-xs">
                  <TableBody>
                    {logs?.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>{l.device_user_id}</TableCell>
                        <TableCell>{new Date(l.punch_at).toLocaleString()}</TableCell>
                        <TableCell>{l.is_processed ? (l.mapped_person_id ? "Mapped" : "Unmapped") : "Pending"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {showUnmapped && (
              <div className="max-h-48 overflow-y-auto rounded-md border">
                {!unmapped?.length && <p className="p-2 text-xs text-muted-foreground">No unmapped biometric IDs.</p>}
                <Table className="text-xs">
                  <TableBody>
                    {unmapped?.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>Device User ID: {l.device_user_id}</TableCell>
                        <TableCell>{new Date(l.punch_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DevicesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("FINGERPRINT");
  const [serialNumber, setSerialNumber] = useState("");
  const [location, setLocation] = useState("");
  const [ipAddress, setIpAddress] = useState("");

  const { data: devices } = useQuery<Device[]>({ queryKey: ["devices"], queryFn: async () => (await api.get("/api/devices")).data.data });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/devices", { name, type, serial_number: serialNumber || undefined, location: location || undefined, ip_address: ipAddress || undefined }),
    onSuccess: () => {
      toast.success("Device registered");
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      setOpen(false);
      setName(""); setSerialNumber(""); setLocation(""); setIpAddress("");
    },
  });

  return (
    <PageWrapper>
      <PageHeader title="Biometric Devices" breadcrumbs={[{ label: "Settings", href: "/settings/institution" }, { label: "Devices" }]} action={<Button onClick={() => setOpen(true)}>+ Register Device</Button>} />

      {!devices?.length && <EmptyState title="No devices registered yet" description="Devices also auto-register on their first ADMS check-in" />}
      <div className="space-y-3">
        {devices?.map((d) => <DeviceCard key={d.id} device={d} />)}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Register New Device</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Device Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Main Gate Scanner" /></div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="FINGERPRINT">Fingerprint</option>
                <option value="RFID">RFID</option>
                <option value="GPS">GPS</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>Serial Number (matches ADMS device SN)</Label><Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Main Gate" /></div>
            <div className="space-y-1.5"><Label>IP Address (optional)</Label><Input value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button disabled={!name || createMutation.isPending} onClick={() => createMutation.mutate()}>Register</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
