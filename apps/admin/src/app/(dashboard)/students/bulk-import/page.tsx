"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import {
  Badge, Button, Card, CardContent, EmptyState, PageHeader, PageWrapper, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  extractBlobErrorMessage, extractErrorMessage, ErrorState, LoadingSpinner,
} from "@education-erp/ui";
import { api } from "@/lib/api";
import { downloadFromApi } from "@/components/reports/report-download-menu";

interface PreviewRow {
  row: number;
  data: Record<string, string | undefined> & { name_en?: string; father_phone?: string; class_label: string; section_label: string };
  valid: boolean;
  errors: string[];
  warnings: string[];
  missing: string[];
}
interface PreviewResult {
  total: number;
  valid: number;
  incomplete: number;
  preview: PreviewRow[];
}
interface ImportResult {
  created: number;
  failed: { row: number; reason: string }[];
  no_own_login_count: number;
  incomplete_count: number;
  login_conflicts: { row: number; message: string }[];
}
interface ClassOption {
  id: string;
  name_en: string;
  is_active: boolean;
  sections: { id: string; name: string; is_active: boolean }[];
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "";
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function BulkImportStudentsPage() {
  const router = useRouter();
  const [selectedYearId, setSelectedYearId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const { data: years, isLoading: yearsLoading, isError: yearsError, error: yearsErrorObj, refetch: refetchYears } = useQuery<{ id: string; label: string; is_active: boolean }[]>({
    queryKey: ["settings", "academic-years"],
    queryFn: async () => (await api.get("/api/settings/academic-years")).data.data,
  });
  // Class names only resolve within one academic year, so default to the
  // active one rather than making the admin pick (and risk the wrong year).
  const academicYearId = selectedYearId || years?.find((y) => y.is_active)?.id || "";
  const yearLabel = years?.find((y) => y.id === academicYearId)?.label ?? "";
  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes", academicYearId],
    queryFn: async () => (await api.get("/api/settings/classes", { params: { academic_year_id: academicYearId } })).data.data,
    enabled: !!academicYearId,
  });
  const activeClasses = classes?.filter((c) => c.is_active) ?? [];

  function reset() {
    setPreview(null);
    setResult(null);
  }

  async function downloadTemplate() {
    setDownloading(true);
    try {
      await downloadFromApi("/api/students/bulk-import/template", { academic_year_id: academicYearId }, `Student Import Template - ${yearLabel}.xlsx`, router);
    } catch (err) {
      toast.error((await extractBlobErrorMessage(err)) ?? "Could not create the template");
    } finally {
      setDownloading(false);
    }
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
      setProblemsOnly(false);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Could not read the file"),
  });

  const validRows = (preview?.preview ?? []).filter((p) => p.valid);
  const confirmMutation = useMutation({
    mutationFn: () => api.post("/api/students/bulk-import/confirm", { academic_year_id: academicYearId, rows: validRows.map((p) => p.data) }),
    onSuccess: (res) => {
      const data = res.data.data as ImportResult;
      // The API numbers rows within the valid subset it was sent; map back to the file's own row numbers.
      const fileRow = (n: number) => validRows[n - 1]?.row ?? n;
      data.failed = data.failed.map((f) => ({ ...f, row: fileRow(f.row) }));
      data.login_conflicts = data.login_conflicts.map((c) => ({ ...c, row: fileRow(c.row) }));
      setResult(data);
      if (!data.created) toast.error("No students were imported — see the errors under Import Result");
      else if (data.failed.length) toast.warning(`Imported ${data.created} students, ${data.failed.length} failed — see Import Result`);
      else toast.success(`Imported ${data.created} students — logins created and SMS sent to each guardian (and to the student too, for rows with a phone)`);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Import failed"),
  });

  const problemRows = preview?.preview.filter((p) => !p.valid || p.warnings.length) ?? [];
  const shownRows = problemsOnly ? problemRows : (preview?.preview ?? []);

  return (
    <PageWrapper>
      <PageHeader
        title="Bulk Import Students"
        subtitle="Add many students at once from an Excel file"
        breadcrumbs={[{ label: "Students", href: "/students" }, { label: "Bulk Import" }]}
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-semibold">1. Download the template</p>
              <p className="text-sm text-muted-foreground">Made for the selected academic year, with its classes and sections built in.</p>
            </div>
            {yearsLoading ? (
              <LoadingSpinner />
            ) : yearsError ? (
              <ErrorState title="Failed to load academic years" description={extractErrorMessage(yearsErrorObj)} retryLabel="Retry" onRetry={() => refetchYears()} />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={academicYearId} onValueChange={(v) => { setSelectedYearId(v); reset(); }}>
                  <SelectTrigger className="w-52"><SelectValue placeholder="Academic year" /></SelectTrigger>
                  <SelectContent>
                    {years?.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}{y.is_active ? " (active)" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={downloadTemplate} disabled={!academicYearId || downloading}>
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download Excel template
                </Button>
              </div>
            )}
          </div>
          <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <li className="flex gap-2"><FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Class &amp; section, gender, religion, district and more are dropdowns — no typing IDs.</li>
            <li className="flex gap-2"><FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Yellow columns are required. The rest complete the profile and match the single Add Student form.</li>
            <li className="flex gap-2"><FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Phone numbers keep their leading 0; a number that lost it (1712345678) is fixed automatically.</li>
            <li className="flex gap-2"><FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Missing details don&apos;t block the import — those students are marked “Incomplete” to finish later.</li>
          </ul>
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">Classes &amp; sections in {yearLabel || "the selected year"}</summary>
            {activeClasses.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {activeClasses.map((c) => (
                  <Badge key={c.id} variant="outline">
                    {c.name_en}
                    {c.sections.filter((s) => s.is_active).length ? ` · ${c.sections.filter((s) => s.is_active).map((s) => s.name).join(", ")}` : ""}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No classes are set up for this academic year yet.</p>
            )}
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="font-semibold">2. Upload the filled file</p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }}
              className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            <Button disabled={!file || !academicYearId || previewMutation.isPending} onClick={() => previewMutation.mutate()}>
              {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {previewMutation.isPending ? "Checking..." : "Check file"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Excel (.xlsx) or CSV. Older CSV files with class/section columns still work.</p>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">3. Review and import</p>
              <Button disabled={!preview.valid || !academicYearId || confirmMutation.isPending || !!result} onClick={() => confirmMutation.mutate()}>
                {confirmMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {confirmMutation.isPending ? "Importing..." : `Import ${preview.valid} student${preview.valid === 1 ? "" : "s"}`}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Rows in file" value={preview.total} />
              <Stat label="Ready to import" value={preview.valid} tone="good" />
              <Stat label="Have problems" value={preview.total - preview.valid} tone={preview.total - preview.valid ? "bad" : undefined} />
              <Stat label="Incomplete profiles" value={preview.incomplete} tone={preview.incomplete ? "warn" : undefined} />
            </div>
            {preview.total > preview.valid && (
              <p className="text-sm text-muted-foreground">Rows with problems are skipped. Fix them in your file and check it again, or import the ready rows now.</p>
            )}
            {problemRows.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={problemsOnly} onChange={(e) => setProblemsOnly(e.target.checked)} />
                Show only rows with problems or warnings ({problemRows.length})
              </label>
            )}
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Row</th><th className="p-2">Name</th><th className="p-2">Class / section</th><th className="p-2">Father&apos;s phone</th><th className="p-2">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((p) => (
                    <tr key={p.row} className={`border-b align-top last:border-0 ${p.valid ? "" : "bg-red-50/60"}`}>
                      <td className="p-2 text-muted-foreground">{p.row}</td>
                      <td className="p-2 font-medium">{p.data.name_en || "—"}</td>
                      <td className="p-2">{p.data.class_label || "—"}{p.data.section_label ? ` / ${p.data.section_label}` : ""}</td>
                      <td className="p-2 font-mono text-xs">{p.data.father_phone ?? "—"}</td>
                      <td className="space-y-1 p-2">
                        {p.errors.map((e) => <p key={e} className="text-red-700">{e}</p>)}
                        {p.warnings.map((w) => <p key={w} className="text-amber-700">{w}</p>)}
                        {p.valid && !p.warnings.length && <Badge variant="success">Ready</Badge>}
                        {p.valid && p.missing.length > 0 && (
                          <p className="text-xs text-muted-foreground" title={p.missing.join(", ")}>
                            {p.missing.length} detail{p.missing.length === 1 ? "" : "s"} missing — will be marked incomplete
                          </p>
                        )}
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
            <p className="font-semibold">Import result</p>
            <p className="text-sm">
              Created: {result.created}
              {result.created > 0 && <> — each new student&apos;s guardian received a portal login via SMS.</>}
            </p>
            {result.incomplete_count > 0 && (
              <p className="text-sm text-amber-700">
                {result.incomplete_count} of {result.created} need more details (photos are always added afterwards).{" "}
                <Link href="/students?incomplete=1" className="font-semibold underline">See incomplete profiles</Link>
              </p>
            )}
            {result.no_own_login_count > 0 && (
              <p className="text-sm text-muted-foreground">
                {result.no_own_login_count} student{result.no_own_login_count === 1 ? "" : "s"} had no student phone, so they can only be reached through
                their guardian&apos;s login until a phone is added.
              </p>
            )}
            {!!result.login_conflicts.length && (
              <div className="text-sm text-amber-700">
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

      {!preview && !result && <EmptyState title="Download the template, fill it in, then upload it here" />}
    </PageWrapper>
  );
}
