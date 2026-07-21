"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, EmptyState, PageHeader, PageWrapper, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface PreviewRow {
  row: number;
  data: {
    name_en: string;
    name_bn?: string;
    designation: string;
    role: string;
    department_id?: string;
    phone: string;
    email?: string;
    gender?: string;
    employment_type?: string;
  };
  valid: boolean;
  errors: string[];
}
interface DepartmentOption {
  id: string;
  name_en: string;
}

const STAFF_ROLES = [
  "PRINCIPAL", "VICE_PRINCIPAL", "EXAM_CONTROLLER", "HEAD_OF_DEPT", "CLASS_TEACHER", "SUBJECT_TEACHER",
  "ACCOUNTANT", "LIBRARIAN", "TRANSPORT_MANAGER", "HOSTEL_MANAGER", "PROCTOR", "REGISTRAR", "IT_ADMIN",
];

const CSV_TEMPLATE = "name_en,name_bn,designation,role,department_id,phone,email,gender,employment_type\n";

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "staff-bulk-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function BulkImportStaffPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ total: number; valid: number; preview: PreviewRow[] } | null>(null);
  const [result, setResult] = useState<{ created: number; failed: { row: number; reason: string }[] } | null>(null);

  const { data: departments } = useQuery<DepartmentOption[]>({
    queryKey: ["settings", "departments"],
    queryFn: async () => (await api.get("/api/settings/departments")).data.data,
  });

  const previewMutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("file", file!);
      return api.post("/api/hr/staff/bulk-import", form, { headers: { "Content-Type": "multipart/form-data" } });
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
      return api.post("/api/hr/staff/bulk-import/confirm", { rows });
    },
    onSuccess: (res) => {
      setResult(res.data.data);
      toast.success(`Imported ${res.data.data.created} staff — logins created and SMS sent to each`);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Import failed"),
  });

  return (
    <PageWrapper>
      <PageHeader title="Bulk Import Staff" breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Staff", href: "/hr/staff" }, { label: "Bulk Import" }]} />

      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="font-medium">1. Prepare your CSV</p>
          <p className="text-sm text-muted-foreground">
            Columns: <code className="rounded bg-muted px-1">name_en, name_bn, designation, role, department_id, phone, email, gender, employment_type</code>.{" "}
            <code className="rounded bg-muted px-1">role</code> must be one of: {STAFF_ROLES.join(", ")}.{" "}
            <code className="rounded bg-muted px-1">phone</code> must be 11 digits starting with 01 (used to create each staff member&apos;s own portal login —
            unlike students, this is required for every row, not optional).{" "}
            <code className="rounded bg-muted px-1">department_id</code> is an internal ID, not a name — copy it from the reference table below (optional, only
            relevant for university-type departments).
          </p>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>Download CSV Template</Button>

          {!!departments?.length && (
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">Department ID reference</summary>
              <table className="mt-2 w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground"><th className="p-1">Department</th><th className="p-1">ID</th></tr></thead>
                <tbody>
                  {departments.map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="p-1">{d.name_en}</td>
                      <td className="p-1 font-mono text-xs">{d.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="font-medium">2. Upload &amp; preview</p>
          <div className="flex items-center gap-3">
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
              <Button size="sm" disabled={!preview.valid || confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
                {confirmMutation.isPending ? "Importing..." : `Confirm Import (${preview.valid})`}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Row</th><th className="p-2">Name</th><th className="p-2">Designation</th><th className="p-2">Role</th><th className="p-2">Phone</th><th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((p) => (
                    <tr key={p.row} className="border-b last:border-0">
                      <td className="p-2">{p.row}</td>
                      <td className="p-2">{p.data.name_en}</td>
                      <td className="p-2">{p.data.designation}</td>
                      <td className="p-2">{p.data.role}</td>
                      <td className="p-2">{p.data.phone}</td>
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
            <p className="text-sm">Created: {result.created} — each new staff member received their own portal login via SMS.</p>
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
