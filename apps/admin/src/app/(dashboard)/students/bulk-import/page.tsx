"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, EmptyState, PageHeader, PageWrapper, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface PreviewRow {
  row: number;
  data: {
    name_en: string;
    name_bn?: string;
    gender: string;
    phone?: string;
    father_name?: string;
    father_phone: string;
    current_class_id: string;
    current_section_id?: string;
  };
  valid: boolean;
  errors: string[];
}
interface ClassOption {
  id: string;
  name_en: string;
}

const CSV_TEMPLATE = "name_en,name_bn,gender,phone,father_name,father_phone,current_class_id,current_section_id\n";

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "students-bulk-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function BulkImportStudentsPage() {
  const [academicYearId, setAcademicYearId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ total: number; valid: number; preview: PreviewRow[] } | null>(null);
  const [result, setResult] = useState<{ created: number; failed: { row: number; reason: string }[]; no_own_login_count: number } | null>(null);

  const { data: years } = useQuery<{ id: string; label: string; is_active: boolean }[]>({
    queryKey: ["settings", "academic-years"],
    queryFn: async () => (await api.get("/api/settings/academic-years")).data.data,
  });
  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });

  const previewMutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("file", file!);
      return api.post("/api/students/bulk-import", form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (res) => {
      setPreview(res.data.data);
      setResult(null);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Preview failed"),
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      const rows = (preview?.preview ?? []).filter((p) => p.valid).map((p) => p.data);
      return api.post("/api/students/bulk-import/confirm", { academic_year_id: academicYearId, rows });
    },
    onSuccess: (res) => {
      setResult(res.data.data);
      toast.success(`Imported ${res.data.data.created} students — logins created and SMS sent to each guardian (and to the student too, for rows with a phone)`);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Import failed"),
  });

  return (
    <PageWrapper>
      <PageHeader title="Bulk Import Students" breadcrumbs={[{ label: "Students", href: "/students" }, { label: "Bulk Import" }]} />

      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="font-medium">1. Prepare your CSV</p>
          <p className="text-sm text-muted-foreground">
            Columns: <code className="rounded bg-muted px-1">name_en, name_bn, gender, phone, father_name, father_phone, current_class_id, current_section_id</code>.{" "}
            <code className="rounded bg-muted px-1">gender</code> must be MALE/FEMALE/OTHER, <code className="rounded bg-muted px-1">father_phone</code> must be 11 digits starting with 01.
            <code className="rounded bg-muted px-1">current_class_id</code>/<code className="rounded bg-muted px-1">current_section_id</code> are internal
            IDs, not names — copy them from the reference table below.
          </p>
          <p className="text-sm text-muted-foreground">
            <code className="rounded bg-muted px-1">phone</code> is optional — leave it blank to skip creating the student&apos;s own
            login (their guardian can still access their data). Fill it in (11 digits starting with 01) to give the student their own
            portal login too, exactly like adding a student one at a time already does.
          </p>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>Download CSV Template</Button>

          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">Class ID reference</summary>
            <table className="mt-2 w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-1">Class</th><th className="p-1">ID</th></tr></thead>
              <tbody>
                {classes?.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="p-1">{c.name_en}</td>
                    <td className="p-1 font-mono text-xs">{c.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="font-medium">2. Upload &amp; preview</p>
          <div className="flex items-center gap-3">
            <Select value={academicYearId} onValueChange={setAcademicYearId}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Academic Year (applies to all rows)" /></SelectTrigger>
              <SelectContent>
                {years?.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}{y.is_active ? " (active)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <Button size="sm" disabled={!file || previewMutation.isPending} onClick={() => previewMutation.mutate()}>
              {previewMutation.isPending ? "Reading..." : "Preview"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between">
              <p className="font-medium">3. Review — {preview.valid} of {preview.total} rows valid</p>
              <Button
                size="sm"
                disabled={!preview.valid || !academicYearId || confirmMutation.isPending}
                onClick={() => confirmMutation.mutate()}
              >
                {confirmMutation.isPending ? "Importing..." : `Confirm Import (${preview.valid})`}
              </Button>
            </div>
            {!academicYearId && <p className="text-xs text-amber-600">Select an academic year above before confirming.</p>}
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Row</th><th className="p-2">Name</th><th className="p-2">Gender</th><th className="p-2">Father&apos;s Phone</th><th className="p-2">Class</th><th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((p) => (
                    <tr key={p.row} className="border-b last:border-0">
                      <td className="p-2">{p.row}</td>
                      <td className="p-2">{p.data.name_en}</td>
                      <td className="p-2">{p.data.gender}</td>
                      <td className="p-2">{p.data.father_phone}</td>
                      <td className="p-2 font-mono text-xs">{p.data.current_class_id}</td>
                      <td className="p-2">
                        {p.valid ? <Badge variant="success">Valid</Badge> : <Badge variant="destructive" title={p.errors.join("; ")}>{p.errors.join("; ")}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="font-medium">Import Result</p>
            <p className="text-sm">Created: {result.created} — each new student&apos;s guardian received a portal login via SMS.</p>
            {result.no_own_login_count > 0 && (
              <p className="text-sm text-amber-600">
                {result.no_own_login_count} of {result.created} student{result.no_own_login_count === 1 ? "" : "s"} had no <code className="rounded bg-muted px-1">phone</code> in
                the CSV, so {result.no_own_login_count === 1 ? "that student" : "those students"} can only be reached via their guardian&apos;s
                login for now — add a phone via Edit Student to give them their own login later.
              </p>
            )}
            {!!result.failed.length && (
              <div className="text-sm text-destructive">
                Failed: {result.failed.length}
                <ul className="list-inside list-disc">
                  {result.failed.map((f, i) => <li key={i}>Row {f.row}: {f.reason}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!preview && !result && <EmptyState title="Upload a CSV to get started" />}
    </PageWrapper>
  );
}
