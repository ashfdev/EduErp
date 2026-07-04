"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Badge, Tabs, TabsList, TabsTrigger, TabsContent,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Input, Label, Textarea, EmptyState,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface AssetDetail {
  id: string;
  asset_uid: string;
  name: string;
  purchase_date: string;
  purchase_price: number;
  book_value: number;
  accumulated_dep: number;
  condition: string;
  status: string;
  qr_code_url: string | null;
  photo_url: string | null;
  current_location: string | null;
  invoice_no: string | null;
  category: { name: string; depreciation_rate: number };
  supplier: { name: string } | null;
  department: { name_en: string } | null;
  depreciation_entries: { id: string; period: string; opening_value: number; dep_rate: number; dep_amount: number; closing_value: number; voucher_id: string | null }[];
  maintenance_logs: { id: string; maintenance_date: string; type: string; description: string; cost: number; done_by: string | null }[];
  transfer_logs: { id: string; from_location: string | null; to_location: string | null; transferred_at: string; reason: string | null }[];
}

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [showDispose, setShowDispose] = useState(false);
  const [maintenance, setMaintenance] = useState({ maintenance_date: new Date().toISOString().slice(0, 10), type: "Repair", description: "", cost: "0" });
  const [dispose, setDispose] = useState({ disposed_reason: "", disposed_value: "0" });

  const { data: asset } = useQuery<AssetDetail>({
    queryKey: ["inventory", "assets", params.id],
    queryFn: async () => (await api.get(`/api/inventory/assets/${params.id}`)).data.data,
  });

  const maintenanceMutation = useMutation({
    mutationFn: () => api.post(`/api/inventory/assets/${params.id}/maintenance`, { ...maintenance, cost: Number(maintenance.cost) }),
    onSuccess: () => {
      toast.success("Maintenance logged");
      queryClient.invalidateQueries({ queryKey: ["inventory", "assets", params.id] });
      setShowMaintenance(false);
    },
  });

  const disposeMutation = useMutation({
    mutationFn: () => api.post(`/api/inventory/assets/${params.id}/dispose`, { ...dispose, disposed_value: Number(dispose.disposed_value) }),
    onSuccess: () => {
      toast.success("Asset disposed");
      queryClient.invalidateQueries({ queryKey: ["inventory", "assets", params.id] });
      setShowDispose(false);
    },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to dispose asset"),
  });

  if (!asset) return null;

  return (
    <PageWrapper>
      <PageHeader
        title={asset.name}
        subtitle={asset.asset_uid}
        breadcrumbs={[{ label: "Inventory" }, { label: "Assets", href: "/inventory/assets" }, { label: asset.asset_uid }]}
        action={
          asset.status !== "DISPOSED" ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowMaintenance(true)}>Log Maintenance</Button>
              <Button size="sm" variant="destructive" onClick={() => setShowDispose(true)}>Dispose</Button>
            </div>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 pt-6 text-sm md:grid-cols-4">
          <div><p className="text-muted-foreground">Category</p><p>{asset.category.name}</p></div>
          <div><p className="text-muted-foreground">Status</p><Badge>{asset.status}</Badge></div>
          <div><p className="text-muted-foreground">Condition</p><Badge variant="outline">{asset.condition}</Badge></div>
          <div><p className="text-muted-foreground">Location</p><p>{asset.current_location ?? "—"}</p></div>
          <div><p className="text-muted-foreground">Purchase Price</p><p>৳{asset.purchase_price.toLocaleString()}</p></div>
          <div><p className="text-muted-foreground">Accumulated Depreciation</p><p>৳{asset.accumulated_dep.toLocaleString()}</p></div>
          <div><p className="text-muted-foreground">Book Value</p><p className="font-medium">৳{asset.book_value.toLocaleString()}</p></div>
          <div><p className="text-muted-foreground">Annual Rate</p><p>{asset.category.depreciation_rate}%</p></div>
        </CardContent>
      </Card>

      <Tabs defaultValue="depreciation">
        <TabsList>
          <TabsTrigger value="depreciation">Depreciation History</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance Log</TabsTrigger>
          <TabsTrigger value="transfers">Transfer History</TabsTrigger>
        </TabsList>
        <TabsContent value="depreciation">
          <Card>
            <CardContent className="pt-6">
              {!asset.depreciation_entries.length ? (
                <EmptyState title="No depreciation runs yet" />
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2">Period</th><th className="py-2">Opening</th><th className="py-2">Rate</th><th className="py-2">Dep Amount</th><th className="py-2">Closing</th></tr></thead>
                  <tbody>
                    {asset.depreciation_entries.map((e) => (
                      <tr key={e.id} className="border-b last:border-0">
                        <td className="py-2">{e.period}</td>
                        <td className="py-2">৳{e.opening_value.toLocaleString()}</td>
                        <td className="py-2">{e.dep_rate}%</td>
                        <td className="py-2">৳{e.dep_amount.toLocaleString()}</td>
                        <td className="py-2">৳{e.closing_value.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {asset.book_value === 0 && asset.depreciation_entries.length > 0 && <p className="mt-2 text-sm text-muted-foreground">Fully depreciated.</p>}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="maintenance">
          <Card>
            <CardContent className="pt-6">
              {!asset.maintenance_logs.length ? <EmptyState title="No maintenance logged" /> : (
                <div className="space-y-2">
                  {asset.maintenance_logs.map((m) => (
                    <div key={m.id} className="rounded-md border p-2 text-sm">
                      <p className="font-medium">{m.type} — {new Date(m.maintenance_date).toLocaleDateString()}</p>
                      <p className="text-muted-foreground">{m.description}{m.cost > 0 && ` — ৳${m.cost.toLocaleString()}`}{m.done_by && ` — by ${m.done_by}`}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="transfers">
          <Card>
            <CardContent className="pt-6">
              {!asset.transfer_logs.length ? <EmptyState title="No transfers logged" /> : (
                <div className="space-y-2">
                  {asset.transfer_logs.map((t) => (
                    <div key={t.id} className="rounded-md border p-2 text-sm">
                      <p>{t.from_location ?? "—"} → {t.to_location ?? "—"}</p>
                      <p className="text-muted-foreground">{new Date(t.transferred_at).toLocaleDateString()}{t.reason && ` — ${t.reason}`}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showMaintenance} onOpenChange={setShowMaintenance}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Maintenance</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={maintenance.maintenance_date} onChange={(e) => setMaintenance((m) => ({ ...m, maintenance_date: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Type</Label><Input value={maintenance.type} onChange={(e) => setMaintenance((m) => ({ ...m, type: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea value={maintenance.description} onChange={(e) => setMaintenance((m) => ({ ...m, description: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Cost (৳)</Label><Input type="number" value={maintenance.cost} onChange={(e) => setMaintenance((m) => ({ ...m, cost: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={() => maintenanceMutation.mutate()} disabled={!maintenance.description}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDispose} onOpenChange={setShowDispose}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dispose Asset</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Reason</Label><Textarea value={dispose.disposed_reason} onChange={(e) => setDispose((d) => ({ ...d, disposed_reason: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Disposed Value (৳, 0 if written off)</Label><Input type="number" value={dispose.disposed_value} onChange={(e) => setDispose((d) => ({ ...d, disposed_value: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="destructive" onClick={() => disposeMutation.mutate()} disabled={!dispose.disposed_reason}>Confirm Dispose</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
