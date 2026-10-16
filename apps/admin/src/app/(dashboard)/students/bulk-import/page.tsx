"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, EmptyState, PageHeader, PageWrapper, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, extractErrorMessage, ErrorState, LoadingSpinner } from "@education-erp/ui";
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
    current_class_id?: string;
    current_section_id?: string;
    class_label: string;
    section_label: string;
  };
  valid: boolean;
  errors: string[];
}
interface ClassOption {
  id: string;
  name_en: string;
  is_active: boolean;
  sections: { id: string; name: string; is_active: boolean }[];
}

const CSV_TEMPLATE = "name_en,name_bn,gender,phone,father_name,father_phone,class,section\n";

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
  const [selectedYearId, setSelectedYearId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ total: number; valid: number; preview: PreviewRow[] } | null>(null);
  const [result, setResult] = useState<{
    created: number;
    failed: { row: number; reason: string }[];
    no_own_login_count: number;
    login_conflicts: { row: number; message: string }[];
  } | null>(null);

  const { data: years, isLoading: yearsLoading, isError: yearsError, error: yearsErrorObj, refetch: refetchYears } = useQuery<{ id: string; label: string; is_active: boolean }[]>({
    queryKey: ["settings", "academic-years"],
    queryFn: async () => (await api.get("/api/settings/academic-years")).data.data,
  });
  // Class names only resolve within one academic year, so default to the
  // active one rather than making the admin pick (and risk the wrong year).
  const academicYearId = selectedYearId || years?.find((y) => y.is_active)?.id || "";
  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes", academicYearId],
    queryFn: async () => (await api.get("/api/settings/classes", { params: { academic_year_id: academicYearId } })).data.data,
    enabled: !!academicYearId,
  });
  const activeClasses = classes?.filter((c) => c.is_active) ?? [];

  function changeYear(id: string) {
    setSelectedYearId(id);
    setPreview(null);
    setResult(null);
  }

  const previewMutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("academic_year_id", academicYearId);
      form.append("file", file!);
      return api.post("/api/students/bulk-import", form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (res) => {
      setPreview(res.data.data);
      setResult(null);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Preview failed"),
  });

  const validRows = (preview?.preview ?? []).filter((p) => p.valid);
  const confirmMutation = useMutation({
    mutationFn: () => api.post("/api/students/bulk-import/confirm", { academic_year_id: academicYearId, rows: validRows.map((p) => p.data) }),
    onSuccess: (res) => {
      const data = res.data.data as NonNullable<typeof result>;
      // The API numbers rows within the valid subset it was sent; map back to the CSV's own row numbers.
      const csvRow = (n: number) => validRows[n - 1]?.row ?? n;
      data.failed = data.failed.map((f) => ({ ...f, row: csvRow(f.row) }));
      data.login_conflicts = data.login_conflicts.map((c) => ({ ...c, row: csvRow(c.row) }));
      setResult(data);
      if (!data.created) toast.error("No students were imported — see the errors under Import Result");
      else if (data.failed.length) toast.warning(`Imported ${data.created} students, ${data.failed.length} failed — see Import Result`);
      else toast.success(`Imported ${data.created} students — logins created and SMS sent to each guardian (and to the student too, for rows with a phone)`);
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
            Columns: <code className="rounded bg-muted px-1">name_en, name_bn, gender, phone, father_name, father_phone, class, section</code>.{" "}
            <code className="rounded bg-muted px-1">gender</code> must be MALE/FEMALE/OTHER, <code className="rounded bg-muted px-1">father_phone</code> must be 11 digits starting with 01.
          </p>
          <p className="text-sm text-muted-foreground">
            <code className="rounded bg-muted px-1">class</code> is the class name exactly as listed below (e.g. &quot;Class 8&quot;; &quot;class-8&quot; or just
            &quot;8&quot; also work). <code className="rounded bg-muted px-1">section</code> is the section name (e.g. &quot;A&quot;) — leave it blank if the
            class has no sections.
          </p>
          <p className="text-sm text-muted-foreground">
            <code className="rounded bg-muted px-1">phone</code> is optional — leave it blank to skip creating the student&apos;s own
            login (their guardian can still access their data). Fill it in (11 digits starting with 01) to give the student their own
            portal login too, exactly like adding a student one at a time already does.
          </p>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>Download CSV Template</Button>

          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">Classes &amp; sections in the selected academic year</summary>
            {activeClasses.length ? (
              <table className="mt-2 w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground"><th className="p-1">class</th><th className="p-1">section</th></tr></thead>
                <tbody>
                  {activeClasses.map((c) => {
                    const sections = c.sections.filter((s) => s.is_active);
                    return (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="p-1">{c.name_en}</td>
                        <td className="p-1">{sections.length ? sections.map((s) => s.name).join(", ") : <span className="text-muted-foreground">(leave blank)</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No classes are set up for this academic year yet.</p>
            )}
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="font-medium">2. Upload &amp; preview</p>
          {yearsLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : yearsError ? (
            <ErrorState title="Failed to load academic years" description={extractErrorMessage(yearsErrorObj)} retryLabel="Retry" onRetry={() => refetchYears()} />
          ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Select value={academicYearId} onValueChange={changeYear}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Academic Year (applies to all rows)" /></SelectTrigger>
              <SelectContent>
                {years?.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}{y.is_active ? " (active)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <Button size="sm" disabled={!file || !academicYearId || previewMutation.isPending} onClick={() => previewMutation.mutate()}>
              {previewMutation.isPending ? "Reading..." : "Preview"}
            </Button>
          </div>
          )}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between">
              <p className="font-medium">3. Review — {preview.valid} of {preview.total} rows valid</p>
              <Button
                size="sm"
                disabled={!preview.valid || !academicYearId || confirmMutation.isPending || !!result}
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
                      <td className="p-2">{p.data.class_label}{p.data.section_label ? ` / ${p.data.section_label}` : ""}</td>
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
            <p className="text-sm">
              Created: {result.created}
              {result.created > 0 && <> — each new student&apos;s guardian received a portal login via SMS.</>}
            </p>
            {result.no_own_login_count > 0 && (
              <p className="text-sm text-amber-600">
                {result.no_own_login_count} of {result.created} student{result.no_own_login_count === 1 ? "" : "s"} had no <code className="rounded bg-muted px-1">phone</code> in
                the CSV, so {result.no_own_login_count === 1 ? "that student" : "those students"} can only be reached via their guardian&apos;s
                login for now — add a phone via Edit Student to give them their own login later.
              </p>
            )}
            {!!result.login_conflicts.length && (
              <div className="text-sm text-amber-600">
                Login conflicts: {result.login_conflicts.length}
                <ul className="list-inside list-disc">
                  {result.login_conflicts.map((c, i) => <li key={i}>Row {c.row}: {c.message}</li>)}
                </ul>
              </div>
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
