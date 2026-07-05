"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { DocumentType } from "@education-erp/types";
import { FIELD_CATALOG, compileCardDesign, type CardDesign, type FieldBox, type FieldDescriptor } from "@education-erp/validators";
import { PageWrapper, PageHeader, Button, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle, Tabs, TabsList, TabsTrigger, TabsContent } from "@education-erp/ui";
import { api } from "@/lib/api";
import { FieldPalette } from "./FieldPalette";
import { CanvasFace } from "./CanvasFace";
import { PropertiesPanel } from "./PropertiesPanel";

const SAMPLE_VALUES: Record<string, string> = {
  "student.name_en": "Md. Sample Student",
  "student.student_uid": "STU-26-01-0001",
  "student.current_class.name_en": "Class 9",
  "student.current_section.name": "A",
  "student.current_roll_no": "01",
  "student.blood_group": "B+",
  "staff.name_en": "Sample Staff",
  "staff.staff_uid": "STAFF-0001",
  "staff.designation": "Senior Teacher",
  "staff.department.name": "Science",
  "staff.blood_group": "O+",
  "staff.phone": "01700000000",
  "applicant.name": "Sample Applicant",
  "applicant.roll": "ADM-2026-0001",
  "applicant.class_name": "Class 8",
  "test.date": "15/07/2026",
  "test.venue": "Main Campus",
  "test.hall": "Hall A",
  "recipient.name": "Sample Recipient",
  "issue_date": "05/07/2026",
  "institution.name_en": "My Institution",
  "institution.phone": "01700000000",
};

function naivePreviewHtml(html: string): string {
  let out = html.replace(/\{\{institutionLogo\}\}/g, "<div style=\"font-size:8px;color:#999;\">[LOGO]</div>");
  out = out.replace(/\{\{signatureBlock \d+\}\}/g, "<div style=\"text-align:center;font-size:7px;color:#999;\"><div style=\"border-top:1px solid #999;margin-top:6mm;\"></div>Signature</div>");
  out = out.replace(/\{\{__barcode_[a-zA-Z0-9_-]+\}\}/g, "");
  out = out.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (_m, path) => SAMPLE_VALUES[path] ?? `[${path}]`);
  return out;
}

function newFieldId() {
  return `field-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultDesign(sizePreset: string, widthMm: number, heightMm: number): CardDesign {
  return {
    version: 1,
    canvas: { size_preset: sizePreset, width_mm: widthMm, height_mm: heightMm, bleed_mm: 3, background_color: "#ffffff", accent_color: "#1a3c4a", dpi: 96 },
    faces: { front: [], back: null },
  };
}

interface CardDesignerProps {
  docType: DocumentType;
  templateId: string | null;
  initialName: string;
  initialDesign: CardDesign | null;
  defaultSizePreset: string;
  defaultWidthMm: number;
  defaultHeightMm: number;
}

export function CardDesigner({ docType, templateId, initialName, initialDesign, defaultSizePreset, defaultWidthMm, defaultHeightMm }: CardDesignerProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [design, setDesign] = useState<CardDesign>(initialDesign ?? defaultDesign(defaultSizePreset, defaultWidthMm, defaultHeightMm));
  const [activeFace, setActiveFace] = useState<"front" | "back">("front");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(templateId);
  const [previewOpen, setPreviewOpen] = useState(false);

  const descriptors = FIELD_CATALOG[docType] ?? [];
  const hasBackFace = descriptors.some((d) => d.group === "Back");
  const currentBoxes = activeFace === "front" ? design.faces.front : design.faces.back ?? [];
  const usedKeys = new Set(currentBoxes.map((b) => b.field_key));
  const selected = currentBoxes.find((b) => b.id === selectedId) ?? null;

  function setFaceBoxes(face: "front" | "back", boxes: FieldBox[]) {
    setDesign((prev) => ({ ...prev, faces: { ...prev.faces, [face]: boxes } }));
  }

  function addField(descriptor: FieldDescriptor) {
    const box: FieldBox = {
      id: newFieldId(),
      field_key: descriptor.field_key,
      kind: descriptor.kind,
      x_mm: 5,
      y_mm: 5,
      width_mm: descriptor.default_size_mm.width,
      height_mm: descriptor.default_size_mm.height,
      rotation: 0,
      z_index: currentBoxes.length + 1,
      static_text: descriptor.default_static_text,
    };
    setFaceBoxes(activeFace, [...currentBoxes, box]);
    setSelectedId(box.id);
  }

  function updateField(id: string, patch: Partial<FieldBox>) {
    setFaceBoxes(activeFace, currentBoxes.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function deleteSelected() {
    if (!selectedId) return;
    setFaceBoxes(activeFace, currentBoxes.filter((b) => b.id !== selectedId));
    setSelectedId(null);
  }

  function toggleBackFace(enabled: boolean) {
    setDesign((prev) => ({ ...prev, faces: { ...prev.faces, back: enabled ? [] : null } }));
    if (enabled) setActiveFace("back");
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      savedId
        ? api.put(`/api/settings/templates/${savedId}/design`, { name, layout_json: design })
        : api.post("/api/settings/templates/design", { doc_type: docType, name, layout_json: design }),
    onSuccess: (res) => {
      toast.success("Design saved");
      setSavedId(res.data.data.id);
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string; details?: unknown } } } })?.response?.data?.error;
      toast.error(message?.message ?? "Failed to save design");
      // eslint-disable-next-line no-console
      console.error("Save design validation error:", message?.details);
    },
  });

  const activateMutation = useMutation({
    mutationFn: () => api.put(`/api/settings/templates/${savedId}/activate`),
    onSuccess: () => toast.success("Set as active template"),
  });

  function openPreview() {
    setPreviewOpen(true);
  }

  const compiled = previewOpen ? compileCardDesign(design, docType) : null;
  const previewHtml = compiled ? naivePreviewHtml(compiled.html_content) : "";

  return (
    <PageWrapper>
      <PageHeader
        title={`Design — ${docType.replace(/_/g, " ")}`}
        breadcrumbs={[{ label: "Settings" }, { label: "Templates", href: "/settings/templates" }, { label: "Design" }]}
        action={
          <div className="flex items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Design name" className="w-56" />
            <Button size="sm" variant="outline" onClick={openPreview}>Preview</Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
            {savedId && (
              <Button size="sm" variant="outline" onClick={() => activateMutation.mutate()} disabled={activateMutation.isPending}>
                Set Active
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => router.push("/settings/templates")}>Back</Button>
          </div>
        }
      />

      {hasBackFace && (
        <Tabs value={activeFace} onValueChange={(v) => setActiveFace(v as "front" | "back")}>
          <TabsList>
            <TabsTrigger value="front">Front</TabsTrigger>
            <TabsTrigger value="back" disabled={!design.faces.back}>Back</TabsTrigger>
          </TabsList>
          {!design.faces.back && (
            <div className="py-2">
              <Button size="sm" variant="outline" onClick={() => toggleBackFace(true)}>+ Enable Back Face</Button>
            </div>
          )}
        </Tabs>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        <FieldPalette fields={descriptors} activeFace={activeFace} usedKeys={usedKeys} onAdd={addField} />
        <div className="flex-1 overflow-auto rounded-md bg-muted/30 p-8">
          <CanvasFace
            canvas={design.canvas}
            boxes={currentBoxes}
            descriptors={descriptors}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={updateField}
          />
        </div>
        <PropertiesPanel
          canvas={design.canvas}
          onCanvasChange={(patch) => setDesign((prev) => ({ ...prev, canvas: { ...prev.canvas, ...patch } }))}
          selected={selected}
          onFieldChange={(patch) => selectedId && updateField(selectedId, patch)}
          onDelete={deleteSelected}
          hasBackFace={hasBackFace}
        />
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Preview (sample data)</DialogTitle></DialogHeader>
          <iframe title="Design preview" srcDoc={previewHtml} className="h-[500px] w-full rounded-md border" />
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
