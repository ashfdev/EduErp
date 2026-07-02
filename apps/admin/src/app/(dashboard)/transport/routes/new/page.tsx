"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label } from "@education-erp/ui";
import { api } from "@/lib/api";

interface StopDraft {
  name: string;
  time: string;
}

export default function NewTransportRoutePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [fare, setFare] = useState(0);
  const [stops, setStops] = useState<StopDraft[]>([{ name: "", time: "" }]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const routeRes = await api.post("/api/transport/routes", { name, fare });
      const routeId = routeRes.data.data.id;
      const validStops = stops.filter((s) => s.name.trim());
      if (validStops.length) {
        await api.post(`/api/transport/routes/${routeId}/stops`, {
          stops: validStops.map((s, i) => ({ name: s.name, stop_order: i, time: s.time || undefined })),
        });
      }
      return routeId;
    },
    onSuccess: (routeId) => {
      toast.success("Route created");
      router.push(`/transport/routes/${routeId}`);
    },
    onError: () => toast.error("Failed to create route"),
  });

  function updateStop(index: number, patch: Partial<StopDraft>) {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  return (
    <PageWrapper>
      <PageHeader title="New Transport Route" breadcrumbs={[{ label: "Transport", href: "/transport" }, { label: "New Route" }]} />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Route Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Route A - Dhanmondi" /></div>
            <div className="space-y-1.5"><Label>Monthly Fare (৳)</Label><Input type="number" value={fare} onChange={(e) => setFare(Number(e.target.value))} /></div>
          </div>

          <div className="space-y-2">
            <Label>Stops (in order)</Label>
            {stops.map((s, i) => (
              <div key={i} className="flex gap-2">
                <Input placeholder={`Stop ${i + 1} name`} value={s.name} onChange={(e) => updateStop(i, { name: e.target.value })} />
                <Input placeholder="07:30" className="w-28" value={s.time} onChange={(e) => updateStop(i, { time: e.target.value })} />
                {stops.length > 1 && (
                  <Button variant="outline" size="sm" onClick={() => setStops((prev) => prev.filter((_, idx) => idx !== i))}>Remove</Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setStops((prev) => [...prev, { name: "", time: "" }])}>+ Add Stop</Button>
          </div>

          <Button disabled={!name || createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? "Creating..." : "Create Route"}
          </Button>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
