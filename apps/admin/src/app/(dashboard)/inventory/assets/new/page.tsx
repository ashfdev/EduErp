"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Card, CardContent, Input, Label, PageHeader, PageWrapper, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface AssetCategory {
  id: string;
  name: string;
  depreciation_rate: number;
}

interface Supplier {
  id: string;
  name: string;
}

export default function NewAssetPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    category_id: "",
    name: "",
    description: "",
    condition: "GOOD",
    purchase_date: new Date().toISOString().slice(0, 10),
    purchase_price: "",
    supplier_id: "",
    invoice_no: "",
    current_location: "",
    notes: "",
  });

  const { data: categories } = useQuery<AssetCategory[]>({ queryKey: ["inventory", "asset-categories"], queryFn: async () => (await api.get("/api/inventory/asset-categories")).data.data });
  const { data: suppliers } = useQuery<Supplier[]>({ queryKey: ["inventory", "suppliers"], queryFn: async () => (await api.get("/api/inventory/suppliers")).data.data });

  const selectedCategory = categories?.find((c) => c.id === form.category_id);

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/api/inventory/assets", {
        ...form,
        purchase_price: Number(form.purchase_price),
        supplier_id: form.supplier_id || undefined,
      }),
    onSuccess: (res) => {
      toast.success(`Asset ${res.data.data.asset_uid} created`);
      router.push(`/inventory/assets/${res.data.data.id}`);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to create asset"),
  });

  return (
    <PageWrapper>
      <PageHeader title="Add Asset" breadcrumbs={[{ label: "Inventory" }, { label: "Assets", href: "/inventory/assets" }, { label: "New" }]} />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm((f) => ({ ...f, category_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.depreciation_rate}%/yr)</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Condition</Label>
              <Select value={form.condition} onValueChange={(v) => setForm((f) => ({ ...f, condition: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Purchase Date</Label><Input type="date" value={form.purchase_date} onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Purchase Price (৳)</Label><Input type="number" value={form.purchase_price} onChange={(e) => setForm((f) => ({ ...f, purchase_price: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Select value={form.supplier_id || "NONE"} onValueChange={(v) => setForm((f) => ({ ...f, supplier_id: v === "NONE" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">—</SelectItem>
                  {suppliers?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5"><Label>Invoice No</Label><Input value={form.invoice_no} onChange={(e) => setForm((f) => ({ ...f, invoice_no: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Location</Label><Input value={form.current_location} onChange={(e) => setForm((f) => ({ ...f, current_location: e.target.value }))} placeholder="e.g. Library Room 2" /></div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>

          {selectedCategory && form.purchase_price && (
            <p className="text-sm text-muted-foreground">
              Estimated annual depreciation: ৳{(Number(form.purchase_price) * (selectedCategory.depreciation_rate / 100)).toLocaleString()} ({selectedCategory.depreciation_rate}% straight-line)
            </p>
          )}

          <div className="flex justify-end">
            <Button disabled={!form.category_id || !form.name || !form.purchase_price || createMutation.isPending} onClick={() => createMutation.mutate()}>
              Save Asset
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
