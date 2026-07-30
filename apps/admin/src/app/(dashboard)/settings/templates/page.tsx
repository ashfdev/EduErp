"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  Button,
  Badge,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  EmptyState,
  ErrorState,
  LoadingSpinner,
  extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

const DOC_TYPES = [
  "STUDENT_ID_CARD", "STAFF_ID_CARD", "ADMIT_CARD", "REGISTRATION_CARD", "MARKSHEET", "REPORT_CARD",
  "TABULATION_SHEET", "TESTIMONIAL", "TRANSFER_CERTIFICATE", "ATTENDANCE_SHEET", "ATTENDANCE_BLANK",
  "FEE_RECEIPT", "PAYSLIP", "SYLLABUS", "MERIT_LIST", "CERTIFICATE", "TRANSPORT_CARD", "HOSTEL_CARD",
];

// Doc types the drag-and-drop visual designer supports — every other type
// stays hand-authored-HTML-only (marksheet, payslip, TC, etc.).
const VISUAL_DOC_TYPES = new Set([
  "STUDENT_ID_CARD", "STAFF_ID_CARD", "TRANSPORT_CARD", "HOSTEL_CARD", "CERTIFICATE", "TESTIMONIAL", "REGISTRATION_CARD",
]);

interface Template {
  id: string;
  doc_type: string;
  name: string;
  is_active: boolean;
  version: number;
  layout_json: unknown;
}

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState(DOC_TYPES[0]!);

  const { data: grouped, isLoading, isError, error, refetch } = useQuery<Record<string, Template[]>>({
    queryKey: ["settings", "templates"],
    queryFn: async () => (await api.get("/api/settings/templates")).data.data,
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [cssFile, setCssFile] = useState<File | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("doc_type", selectedType);
      form.append("name", name);
      if (htmlFile) form.append("html", htmlFile);
      if (cssFile) form.append("css", cssFile);
      return api.post("/api/settings/templates", form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      toast.success("Template uploaded");
      queryClient.invalidateQueries({ queryKey: ["settings", "templates"] });
      setOpen(false);
      setName("");
      setHtmlFile(null);
      setCssFile(null);
    },
    onError: () => toast.error("Failed to upload template"),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/settings/templates/${id}/activate`),
    onSuccess: () => {
      toast.success("Template activated");
      queryClient.invalidateQueries({ queryKey: ["settings", "templates"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to activate template"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/templates/${id}`),
    onSuccess: () => {
      toast.success("Template deleted");
      queryClient.invalidateQueries({ queryKey: ["settings", "templates"] });
    },
    onError: () => toast.error("Cannot delete the only template for this document type"),
  });

  async function loadPreview() {
    try {
      const res = await api.get(`/api/settings/templates/preview/${selectedType}`);
      setPreviewHtml(res.data.data.html);
    } catch {
      toast.error("No active template to preview for this document type");
    }
  }

  const list = grouped?.[selectedType] ?? [];

  return (
    <PageWrapper>
      <PageHeader title="Document Templates" subtitle="HTML templates used to generate documents" breadcrumbs={[{ label: "Settings" }, { label: "Templates" }]} />

      <div className="grid grid-cols-4 gap-6">
        <div className="col-span-1 space-y-1">
          {DOC_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm ${selectedType === t ? "bg-accent font-medium" : "hover:bg-accent/50"}`}
            >
              {t.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        <div className="col-span-3 space-y-4">
          <div className="flex justify-between">
            <h3 className="font-medium">{selectedType.replace(/_/g, " ")}</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={loadPreview}>Preview</Button>
              {VISUAL_DOC_TYPES.has(selectedType) && (
                <Link href={`/settings/templates/design/${selectedType}`}>
                  <Button size="sm" variant="outline">Design (Visual)</Button>
                </Link>
              )}
              <Button size="sm" onClick={() => setOpen(true)}>Upload Custom Template</Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : isError ? (
            <ErrorState title="Failed to load templates" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
          ) : (
            <>
          {!list.length && <EmptyState title="No templates for this document type yet" />}

          <div className="space-y-2">
            {list.map((t) => (
              <Card key={t.id}>
                <CardContent className="flex items-center justify-between pt-4">
                  <div>
                    <p className="font-medium">{t.name} <span className="text-xs text-muted-foreground">v{t.version}</span></p>
                    {t.is_active && <Badge variant="success">Active</Badge>}
                    {!!t.layout_json && <Badge variant="outline">Visual Design</Badge>}
                  </div>
                  <div className="flex gap-2">
                    {!!t.layout_json && (
                      <Link href={`/settings/templates/design/${selectedType}/${t.id}`}>
                        <Button size="sm" variant="outline">Edit in Designer</Button>
                      </Link>
                    )}
                    {!t.is_active && <Button size="sm" variant="outline" onClick={() => activateMutation.mutate(t.id)}>Set Active</Button>}
                    <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(t.id)}>Delete</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
            </>
          )}

          {previewHtml && (
            <div className="rounded-md border">
              <iframe title="Template preview" srcDoc={previewHtml} className="h-96 w-full rounded-md" />
            </div>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload Template — {selectedType.replace(/_/g, " ")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Template Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Formal Blue" /></div>
            <div className="space-y-1.5"><Label>HTML File</Label><Input type="file" accept=".html" onChange={(e) => setHtmlFile(e.target.files?.[0] ?? null)} /></div>
            <div className="space-y-1.5"><Label>CSS File (optional)</Label><Input type="file" accept=".css" onChange={(e) => setCssFile(e.target.files?.[0] ?? null)} /></div>
          </div>
          <DialogFooter><Button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending || !htmlFile || !name}>Upload</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
