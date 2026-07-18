"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, CardHeader, CardTitle, Button, Input, Switch, Label } from "@education-erp/ui";
import { api } from "@/lib/api";

const DOC_TYPES = [
  "STUDENT_ID_CARD", "STAFF_ID_CARD", "ADMIT_CARD", "REGISTRATION_CARD", "MARKSHEET", "REPORT_CARD",
  "TABULATION_SHEET", "TESTIMONIAL", "TRANSFER_CERTIFICATE", "ATTENDANCE_SHEET", "ATTENDANCE_BLANK",
  "FEE_RECEIPT", "PAYSLIP", "SYLLABUS", "MERIT_LIST", "NOTICE",
];
const AUTHORITY_ROLES = [
  "PRINCIPAL", "VICE_PRINCIPAL", "HEADMASTER", "VICE_CHANCELLOR", "PRO_VICE_CHANCELLOR",
  "EXAM_CONTROLLER", "REGISTRAR", "PROCTOR", "DEAN", "HOD", "LIBRARIAN", "ACCOUNTANT", "CLASS_TEACHER",
];

interface Slot {
  doc_type: string;
  slot: number;
  label: string;
  authority_role: string;
  is_required: boolean;
}
interface Coverage {
  doc_type: string;
  has_signature_slot: boolean;
}

export default function SignatureMappingPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery<Slot[]>({
    queryKey: ["settings", "authority-config"],
    queryFn: async () => (await api.get("/api/settings/authority-config")).data.data,
  });
  const { data: coverage } = useQuery<Coverage[]>({
    queryKey: ["settings", "authority-config", "coverage"],
    queryFn: async () => (await api.get("/api/settings/authority-config/coverage")).data.data,
  });
  const noSlotDocTypes = new Set((coverage ?? []).filter((c) => !c.has_signature_slot).map((c) => c.doc_type));

  const [slots, setSlots] = useState<Record<string, Slot[]>>({});

  useEffect(() => {
    const grouped: Record<string, Slot[]> = {};
    for (const docType of DOC_TYPES) {
      grouped[docType] = [1, 2, 3].map((slotNum) => {
        const existing = data?.find((s) => s.doc_type === docType && s.slot === slotNum);
        return existing ?? { doc_type: docType, slot: slotNum, label: "", authority_role: "PRINCIPAL", is_required: false };
      });
    }
    setSlots(grouped);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const all = Object.values(slots).flat().filter((s) => s.label.trim() !== "");
      return api.put("/api/settings/authority-config", all);
    },
    onSuccess: () => {
      toast.success("Authority mapping saved");
      queryClient.invalidateQueries({ queryKey: ["settings", "authority-config"] });
    },
  });

  function updateSlot(docType: string, slotNum: number, patch: Partial<Slot>) {
    setSlots((prev) => ({
      ...prev,
      [docType]: prev[docType]?.map((s) => (s.slot === slotNum ? { ...s, ...patch } : s)) ?? [],
    }));
  }

  return (
    <PageWrapper>
      <PageHeader title="Signature Mapping" subtitle="Which authority signs which document, per slot" breadcrumbs={[{ label: "Settings" }, { label: "Signature Mapping" }]} />

      <div className="space-y-3">
        {DOC_TYPES.map((docType) => (
          <Card key={docType}>
            <CardHeader>
              <CardTitle className="text-sm">{docType.replace(/_/g, " ")}</CardTitle>
              {noSlotDocTypes.has(docType) && (
                <p className="text-xs text-amber-600">
                  This document type has an authority mapped, but its active template has no signature slot — it will not appear on generated PDFs.
                </p>
              )}
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              {slots[docType]?.map((slot) => (
                <div key={slot.slot} className="space-y-2 rounded-md border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Slot {slot.slot}</p>
                  <select
                    className="w-full rounded-md border px-2 py-1 text-sm"
                    value={slot.authority_role}
                    onChange={(e) => updateSlot(docType, slot.slot, { authority_role: e.target.value })}
                  >
                    {AUTHORITY_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                  </select>
                  <Input placeholder="Label (e.g. Principal)" value={slot.label} onChange={(e) => updateSlot(docType, slot.slot, { label: e.target.value })} className="h-8" />
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Required</Label>
                    <Switch checked={slot.is_required} onCheckedChange={(v) => updateSlot(docType, slot.slot, { is_required: v })} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Button className="sticky bottom-4" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? "Saving..." : "Save All Mappings"}
      </Button>
    </PageWrapper>
  );
}
