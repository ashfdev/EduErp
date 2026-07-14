"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { api } from "@/lib/api";
import { Card, CardContent, Badge, Button, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, LoadingSpinner, EmptyState } from "@education-erp/ui";

interface ComplaintRow {
  id: string;
  category: string;
  description: string;
  status: string;
  created_at: string;
}

function ComplaintsContent() {
  const queryClient = useQueryClient();
  const t = useTranslations("complaints");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ category: "ACADEMIC", description: "" });

  const { data, isLoading } = useQuery<ComplaintRow[]>({
    queryKey: ["portal", "complaints"],
    queryFn: async () => (await api.get("/api/portal/complaints")).data.data,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/portal/complaints", draft),
    onSuccess: () => {
      toast.success(t("submitted"));
      queryClient.invalidateQueries({ queryKey: ["portal", "complaints"] });
      setOpen(false);
      setDraft({ category: "ACADEMIC", description: "" });
    },
  });

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <Button size="sm" onClick={() => setOpen(true)}>{t("raise")}</Button>
      </div>

      {!data?.length && <EmptyState title={t("noComplaints")} />}
      {data?.map((c) => (
        <Card key={c.id}>
          <CardContent className="space-y-1 pt-6">
            <div className="flex items-center justify-between">
              <Badge variant="outline">{c.category}</Badge>
              <Badge variant={c.status === "RESOLVED" || c.status === "CLOSED" ? "default" : "outline"}>{c.status}</Badge>
            </div>
            <p className="text-sm">{c.description}</p>
            <p className="text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString()}</p>
          </CardContent>
        </Card>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("raiseTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("category")}</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={draft.category} onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}>
                <option value="ACADEMIC">{t("categoryAcademic")}</option>
                <option value="FACILITY">{t("categoryFacility")}</option>
                <option value="STAFF_CONDUCT">{t("categoryStaffConduct")}</option>
                <option value="BULLYING">{t("categoryBullying")}</option>
                <option value="OTHER">{t("categoryOther")}</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>{t("description")}</Label><Input value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !draft.description}>{t("submit")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ComplaintsPage() {
  return (
    <PortalShell>
      <ComplaintsContent />
    </PortalShell>
  );
}
