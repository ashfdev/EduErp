"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, Checkbox, Input, Label, PageHeader, PageWrapper, RecordPickerDialog, RichTextEditor, Textarea, extractBlobErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

interface Option {
  id: string;
  name_en?: string;
  name?: string;
  label?: string;
  sections?: { id: string; name: string }[];
  groups?: { id: string; name_en: string }[];
}

// Must mirror server/api/src/lib/roles.ts's EXAM_MANAGE_ROLES exactly — a
// frontend-only mirror driving whether the override UI even renders, not an
// authorization decision (the real check is server-side in documents.routes.ts).
const EXAM_MANAGE_ROLES = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];

interface ClearanceStatusRow {
  student_id: string;
  name: string;
  student_uid: string;
  roll_no: string | null;
  clearance: {
    accounts: { required: boolean; clear: boolean; due_amount: number };
    library: { clear: boolean; fine_amount: number };
    exam_office: { clear: boolean };
    all_clear: boolean;
  };
}

function blockReasons(c: ClearanceStatusRow["clearance"]): string[] {
  const reasons: string[] = [];
  if (!c.accounts.clear) reasons.push(`Due ৳${c.accounts.due_amount.toLocaleString()}`);
  if (!c.library.clear) reasons.push(`Library fine ৳${c.library.fine_amount.toLocaleString()}`);
  if (!c.exam_office.clear) reasons.push("Exam office not cleared");
  return reasons;
}

interface StudentOption {
  id: string;
  student_uid: string;
  name_en: string;
  current_class?: { name_en: string } | null;
  current_section?: { name: string } | null;
}

interface StaffOption {
  id: string;
  staff_uid: string;
  name_en: string;
  designation: string;
}

interface TestimonialDraft {
  body_html: string;
  leaving_date: string;
}
interface TransferCertDraft {
  conduct: string;
  last_exam_result: string;
  remarks: string;
  leaving_reason: string;
  leaving_date: string;
}

type FieldKind = "text" | "select-class" | "select-section" | "select-group" | "select-exam" | "select-year" | "select-student" | "select-staff" | "date" | "month" | "year" | "number";

interface DocDef {
  key: string;
  title: string;
  description: string;
  endpoint?: (params: Record<string, string>) => string;
  fields: { key: string; label: string; kind: FieldKind; required?: boolean }[];
  // For entries that now have a proper home elsewhere (Fee Receipt, Payslip)
  // — the sidebar keeps a fallback entry so staff who land here first can
  // still find their way, but it points them at the real searchable screen
  // instead of asking for a raw id.
  redirectTo?: { href: string; label: string };
}

const DOC_TYPES: DocDef[] = [
  {
    key: "student-id-card",
    title: "Student ID Card",
    description: "Single student ID card (front, 85.6×54mm).",
    endpoint: (p) => `/api/documents/student/${p.student_id}/id-card`,
    fields: [{ key: "student_id", label: "Student", kind: "select-student", required: true }],
  },
  {
    key: "id-cards-class",
    title: "Student ID Cards (Class)",
    description: "Bulk-generate ID cards for every active student in a class.",
    endpoint: (p) => `/api/documents/id-cards/class/${p.class_id}`,
    fields: [{ key: "class_id", label: "Class", kind: "select-class", required: true }],
  },
  {
    key: "staff-id-card",
    title: "Staff ID Card",
    description: "Single staff ID card.",
    endpoint: (p) => `/api/documents/staff/${p.staff_id}/id-card`,
    fields: [{ key: "staff_id", label: "Staff", kind: "select-staff", required: true }],
  },
  {
    key: "id-cards-all-staff",
    title: "Staff ID Cards (All)",
    description: "Bulk-generate ID cards for every active staff member.",
    endpoint: () => `/api/documents/id-cards/all-staff`,
    fields: [],
  },
  {
    key: "admit-cards",
    title: "Admit Card (Class)",
    description: "Bulk admit cards for every student in a class for an exam.",
    endpoint: (p) => `/api/documents/exam/${p.exam_id}/admit-cards?class_id=${p.class_id}${p.section_id ? `&section_id=${p.section_id}` : ""}`,
    fields: [
      { key: "exam_id", label: "Exam", kind: "select-exam", required: true },
      { key: "class_id", label: "Class", kind: "select-class", required: true },
      { key: "section_id", label: "Section (optional)", kind: "select-section" },
    ],
  },
  {
    key: "marksheet",
    title: "Marksheet (Student)",
    description: "Single student marksheet for an exam.",
    endpoint: (p) => `/api/documents/result/${p.exam_id}/marksheet/${p.student_id}`,
    fields: [
      { key: "exam_id", label: "Exam", kind: "select-exam", required: true },
      { key: "student_id", label: "Student", kind: "select-student", required: true },
    ],
  },
  {
    key: "marksheets-class",
    title: "Marksheets (Class)",
    description: "Bulk marksheets for every student in a class.",
    endpoint: (p) => `/api/documents/result/${p.exam_id}/marksheets/class/${p.class_id}${p.group_id ? `?group_id=${p.group_id}` : ""}`,
    fields: [
      { key: "exam_id", label: "Exam", kind: "select-exam", required: true },
      { key: "class_id", label: "Class", kind: "select-class", required: true },
      { key: "group_id", label: "Group (optional)", kind: "select-group" },
    ],
  },
  {
    key: "report-card",
    title: "Report Card (Student)",
    description: "Single student report card with attendance summary.",
    endpoint: (p) => `/api/documents/result/${p.exam_id}/report-card/${p.student_id}`,
    fields: [
      { key: "exam_id", label: "Exam", kind: "select-exam", required: true },
      { key: "student_id", label: "Student", kind: "select-student", required: true },
    ],
  },
  {
    key: "tabulation-sheet",
    title: "Tabulation Sheet",
    description: "All students × all subjects for a class (A3 landscape).",
    endpoint: (p) => `/api/documents/result/${p.exam_id}/tabulation/${p.class_id}${p.group_id ? `?group_id=${p.group_id}` : ""}`,
    fields: [
      { key: "exam_id", label: "Exam", kind: "select-exam", required: true },
      { key: "class_id", label: "Class", kind: "select-class", required: true },
      { key: "group_id", label: "Group (optional)", kind: "select-group" },
    ],
  },
  {
    key: "blank-marksheet",
    title: "Blank Marksheet",
    description: "Empty grid (all students × subjects) for manual mark entry, e.g. offline exam invigilation.",
    endpoint: (p) => `/api/documents/result/${p.exam_id}/blank-marksheet/${p.class_id}${p.group_id ? `?group_id=${p.group_id}` : ""}`,
    fields: [
      { key: "exam_id", label: "Exam", kind: "select-exam", required: true },
      { key: "class_id", label: "Class", kind: "select-class", required: true },
      { key: "group_id", label: "Group (optional)", kind: "select-group" },
    ],
  },
  {
    key: "merit-list",
    title: "Merit List",
    description: "Ranked merit list for a class exam.",
    endpoint: (p) => `/api/documents/result/${p.exam_id}/merit-list/${p.class_id}${p.group_id ? `?group_id=${p.group_id}` : ""}`,
    fields: [
      { key: "exam_id", label: "Exam", kind: "select-exam", required: true },
      { key: "class_id", label: "Class", kind: "select-class", required: true },
      { key: "group_id", label: "Group (optional)", kind: "select-group" },
    ],
  },
  {
    key: "testimonial",
    title: "Testimonial",
    description: "Character testimonial for a student.",
    endpoint: (p) => `/api/documents/student/${p.student_id}/testimonial`,
    fields: [{ key: "student_id", label: "Student", kind: "select-student", required: true }],
  },
  {
    key: "transfer-cert",
    title: "Transfer Certificate",
    description: "Formal BD-format transfer certificate.",
    endpoint: (p) => `/api/documents/student/${p.student_id}/transfer-cert`,
    fields: [{ key: "student_id", label: "Student", kind: "select-student", required: true }],
  },
  {
    key: "daily-register",
    title: "Attendance Register (Daily)",
    description: "Printable daily attendance register for a class/section.",
    endpoint: (p) => `/api/documents/attendance/daily-register?date=${p.date}&class_id=${p.class_id}${p.section_id ? `&section_id=${p.section_id}` : ""}`,
    fields: [
      { key: "date", label: "Date", kind: "date", required: true },
      { key: "class_id", label: "Class", kind: "select-class", required: true },
      { key: "section_id", label: "Section (optional)", kind: "select-section" },
    ],
  },
  {
    key: "monthly-sheet",
    title: "Attendance Sheet (Monthly)",
    description: "One row per student, one column per day of the month.",
    endpoint: (p) => `/api/documents/attendance/monthly-sheet?class_id=${p.class_id}&month=${p.month}&year=${p.year}${p.section_id ? `&section_id=${p.section_id}` : ""}`,
    fields: [
      { key: "class_id", label: "Class", kind: "select-class", required: true },
      { key: "section_id", label: "Section (optional)", kind: "select-section" },
      { key: "month", label: "Month (1-12)", kind: "month", required: true },
      { key: "year", label: "Year", kind: "year", required: true },
    ],
  },
  {
    key: "blank-sheet",
    title: "Blank Attendance Sheet",
    description: "Empty grid for manual attendance marking.",
    endpoint: (p) => `/api/documents/attendance/blank-sheet?class_id=${p.class_id}&from_date=${p.from_date}&to_date=${p.to_date}${p.section_id ? `&section_id=${p.section_id}` : ""}`,
    fields: [
      { key: "class_id", label: "Class", kind: "select-class", required: true },
      { key: "section_id", label: "Section (optional)", kind: "select-section" },
      { key: "from_date", label: "From Date", kind: "date", required: true },
      { key: "to_date", label: "To Date", kind: "date", required: true },
    ],
  },
  {
    key: "fee-receipt",
    title: "Fee Receipt",
    description: "Receipt for a single payment.",
    fields: [],
    redirectTo: { href: "/accounts/receipts", label: "Go to Fee Receipts" },
  },
  {
    key: "dues-report",
    title: "Fee Dues Report",
    description: "List of outstanding invoices, optionally filtered by class.",
    endpoint: (p) => `/api/documents/fee/dues-report${p.class_id ? `?class_id=${p.class_id}` : ""}`,
    fields: [{ key: "class_id", label: "Class (optional)", kind: "select-class" }],
  },
  {
    key: "payslip",
    title: "Payslip",
    description: "Salary payslip for a payroll record.",
    fields: [],
    redirectTo: { href: "/hr/payroll", label: "Go to Payroll" },
  },
];

export default function DocumentPrintCenterPage() {
  const [selectedKey, setSelectedKey] = useState(DOC_TYPES[0]!.key);
  const [values, setValues] = useState<Record<string, string>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [pickerField, setPickerField] = useState<{ key: string; kind: "select-student" | "select-staff" } | null>(null);
  // Narrows the "Choose a Student" picker to one class/section instead of
  // paging through the whole institution's roster (previously the only
  // option) — kept separate from `values` since not every doc type that
  // opens this picker has its own Class field.
  const [pickerClassId, setPickerClassId] = useState("");
  const [pickerSectionId, setPickerSectionId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doc = DOC_TYPES.find((d) => d.key === selectedKey)!;

  const { data: classes } = useQuery<Option[]>({ queryKey: ["settings", "classes"], queryFn: async () => (await api.get("/api/settings/classes")).data.data });
  const sections = classes?.find((c) => c.id === values.class_id)?.sections ?? [];
  const pickerSections = classes?.find((c) => c.id === pickerClassId)?.sections ?? [];
  const groups = classes?.find((c) => c.id === values.class_id)?.groups ?? [];
  const { data: exams } = useQuery<Option[]>({ queryKey: ["exams"], queryFn: async () => (await api.get("/api/exams")).data.data });

  const { user } = useAuthStore();
  const canOverride = !!user && EXAM_MANAGE_ROLES.includes(user.role);
  const [overrideSelected, setOverrideSelected] = useState<Set<string>>(new Set());
  const [overrideReason, setOverrideReason] = useState("");

  // Compose-and-edit step (Plan Fifteen, Phase K): Testimonial/Transfer
  // Certificate get a real editable draft — pre-filled with this specific
  // student's actual merge fields already resolved, never raw template
  // syntax — instead of a search-then-download-blind flow.
  const isTestimonial = doc.key === "testimonial";
  const isTransferCert = doc.key === "transfer-cert";
  const [composeBody, setComposeBody] = useState("");
  const [composeTc, setComposeTc] = useState({ conduct: "", last_exam_result: "", remarks: "", leaving_reason: "" });
  const [composeLeavingDate, setComposeLeavingDate] = useState("");

  const { data: composeDraft } = useQuery<TestimonialDraft | TransferCertDraft>({
    queryKey: ["documents", "compose-draft", doc.key, values.student_id],
    queryFn: async () => (await api.get(`/api/documents/student/${values.student_id}/${doc.key}/draft`)).data.data,
    enabled: (isTestimonial || isTransferCert) && !!values.student_id,
  });

  // Re-seeds from a fresh draft whenever the selected student (and therefore
  // the draft query) changes, so a second generation for a different student
  // always starts clean — never carries the previous student's edited text
  // forward.
  useEffect(() => {
    if (isTestimonial && composeDraft) {
      const d = composeDraft as TestimonialDraft;
      setComposeBody(d.body_html);
      setComposeLeavingDate(d.leaving_date);
    }
    if (isTransferCert && composeDraft) {
      const d = composeDraft as TransferCertDraft;
      setComposeTc({ conduct: d.conduct, last_exam_result: d.last_exam_result, remarks: d.remarks, leaving_reason: d.leaving_reason });
      setComposeLeavingDate(d.leaving_date);
    }
  }, [composeDraft, isTestimonial, isTransferCert]);

  const isAdmitCards = doc.key === "admit-cards";
  const { data: clearanceStatus, isFetching: statusLoading } = useQuery<ClearanceStatusRow[]>({
    queryKey: ["documents", "admit-cards", "status", values.exam_id, values.class_id, values.section_id],
    queryFn: async () =>
      (
        await api.get(`/api/documents/exam/${values.exam_id}/admit-cards/status`, {
          params: { class_id: values.class_id, section_id: values.section_id || undefined },
        })
      ).data.data,
    enabled: isAdmitCards && !!values.exam_id && !!values.class_id,
  });
  const blockedRows = clearanceStatus?.filter((r) => !r.clearance.all_clear) ?? [];

  // A fresh class/section/exam pick invalidates any prior override
  // selections — never silently carry an override forward onto a different
  // roster than the one it was chosen for.
  useEffect(() => {
    setOverrideSelected(new Set());
    setOverrideReason("");
  }, [values.exam_id, values.class_id, values.section_id]);

  function toggleOverride(studentId: string) {
    setOverrideSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function setValue(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function selectDoc(key: string) {
    setSelectedKey(key);
    setValues({});
    setLabels({});
    setError(null);
    setComposeBody("");
    setComposeTc({ conduct: "", last_exam_result: "", remarks: "", leaving_reason: "" });
    setComposeLeavingDate("");
  }

  const canGenerate =
    doc.fields.filter((f) => f.required).every((f) => values[f.key]) &&
    !((isTestimonial || isTransferCert) && values.student_id && !composeDraft);

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }

  async function download() {
    setGenerating(true);
    setError(null);
    try {
      if (isTestimonial) {
        const res = await api.post(
          `/api/documents/student/${values.student_id}/testimonial`,
          { body_html: composeBody, leaving_date: composeLeavingDate || undefined },
          { params: { download: "true" }, responseType: "blob" },
        );
        triggerDownload(res.data, `${doc.key}.pdf`);
      } else if (isTransferCert) {
        const res = await api.post(
          `/api/documents/student/${values.student_id}/transfer-cert`,
          { ...composeTc, leaving_date: composeLeavingDate || undefined },
          { params: { download: "true" }, responseType: "blob" },
        );
        triggerDownload(res.data, `${doc.key}.pdf`);
      } else {
        let path = doc.endpoint!(values);
        if (isAdmitCards && overrideSelected.size > 0) {
          path += `&override_student_ids=${encodeURIComponent([...overrideSelected].join(","))}&override_reason=${encodeURIComponent(overrideReason)}`;
        }
        const res = await api.get(path, { params: { download: "true" }, responseType: "blob" });
        triggerDownload(res.data, `${doc.key}.pdf`);
      }
    } catch (err) {
      setError((await extractBlobErrorMessage(err)) ?? "Failed to generate document — check the required fields and try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <PageWrapper>
      <PageHeader title="Document Print Center" breadcrumbs={[{ label: "Documents" }, { label: "Print" }]} />
      <div className="flex gap-6">
        <aside className="w-56 shrink-0 space-y-1">
          {DOC_TYPES.map((d) => (
            <button
              key={d.key}
              onClick={() => selectDoc(d.key)}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm ${d.key === selectedKey ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
            >
              {d.title}
            </button>
          ))}
        </aside>

        <div className="flex-1 space-y-4">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div>
                <p className="font-medium">{doc.title}</p>
                <p className="text-sm text-muted-foreground">{doc.description}</p>
              </div>

              {doc.redirectTo ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    This now has its own searchable screen — find the record there and download directly, no id required.
                  </p>
                  <Link href={doc.redirectTo.href}>
                    <Button>{doc.redirectTo.label}</Button>
                  </Link>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    {doc.fields.map((f) => (
                      <div key={f.key} className="space-y-1.5">
                        <Label>{f.label}</Label>
                        {f.kind === "select-class" && (
                          <select className="w-full rounded-md border px-3 py-2 text-sm" value={values[f.key] ?? ""} onChange={(e) => setValue(f.key, e.target.value)}>
                            <option value="">Select...</option>
                            {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
                          </select>
                        )}
                        {f.kind === "select-section" && (
                          <select className="w-full rounded-md border px-3 py-2 text-sm" value={values[f.key] ?? ""} onChange={(e) => setValue(f.key, e.target.value)} disabled={!values.class_id}>
                            <option value="">All Sections</option>
                            {sections?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        )}
                        {f.kind === "select-group" && !!groups.length && (
                          <select className="w-full rounded-md border px-3 py-2 text-sm" value={values[f.key] ?? ""} onChange={(e) => setValue(f.key, e.target.value)} disabled={!values.class_id}>
                            <option value="">All Groups</option>
                            {groups.map((g) => <option key={g.id} value={g.id}>{g.name_en}</option>)}
                          </select>
                        )}
                        {f.kind === "select-group" && !groups.length && (
                          <p className="pt-2 text-xs text-muted-foreground">{values.class_id ? "This class has no groups defined." : "Select a class first."}</p>
                        )}
                        {f.kind === "select-exam" && (
                          <select className="w-full rounded-md border px-3 py-2 text-sm" value={values[f.key] ?? ""} onChange={(e) => setValue(f.key, e.target.value)}>
                            <option value="">Select...</option>
                            {exams?.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                          </select>
                        )}
                        {(f.kind === "select-student" || f.kind === "select-staff") && (
                          <div className="flex items-center gap-2">
                            {values[f.key] ? (
                              <>
                                <span className="flex-1 truncate rounded-md border bg-muted px-3 py-2 text-sm">{labels[f.key]}</span>
                                <Button type="button" size="sm" variant="outline" onClick={() => setPickerField({ key: f.key, kind: f.kind as "select-student" | "select-staff" })}>
                                  Change
                                </Button>
                              </>
                            ) : (
                              <Button type="button" variant="outline" onClick={() => setPickerField({ key: f.key, kind: f.kind as "select-student" | "select-staff" })}>
                                {f.kind === "select-student" ? "Choose Student…" : "Choose Staff…"}
                              </Button>
                            )}
                          </div>
                        )}
                        {(f.kind === "text" || f.kind === "number") && (
                          <Input value={values[f.key] ?? ""} onChange={(e) => setValue(f.key, e.target.value)} />
                        )}
                        {f.kind === "date" && <Input type="date" value={values[f.key] ?? ""} onChange={(e) => setValue(f.key, e.target.value)} />}
                        {f.kind === "month" && <Input type="number" min={1} max={12} value={values[f.key] ?? ""} onChange={(e) => setValue(f.key, e.target.value)} />}
                        {f.kind === "year" && <Input type="number" value={values[f.key] ?? ""} onChange={(e) => setValue(f.key, e.target.value)} />}
                      </div>
                    ))}
                  </div>

                  {(isTestimonial || isTransferCert) && values.student_id && (
                    <div className="space-y-3 rounded-md border p-3">
                      <p className="text-sm font-medium">Compose — edit the wording before generating</p>
                      {!composeDraft && <p className="text-sm text-muted-foreground">Loading draft...</p>}
                      {isTestimonial && composeDraft && <RichTextEditor value={composeBody} onChange={setComposeBody} />}
                      {isTransferCert && composeDraft && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label>Character and Conduct</Label>
                            <Input value={composeTc.conduct} onChange={(e) => setComposeTc((p) => ({ ...p, conduct: e.target.value }))} />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Result of Last Examination</Label>
                            <Input value={composeTc.last_exam_result} onChange={(e) => setComposeTc((p) => ({ ...p, last_exam_result: e.target.value }))} />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Reason for Leaving</Label>
                            <Input value={composeTc.leaving_reason} onChange={(e) => setComposeTc((p) => ({ ...p, leaving_reason: e.target.value }))} />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Remarks</Label>
                            <Input value={composeTc.remarks} onChange={(e) => setComposeTc((p) => ({ ...p, remarks: e.target.value }))} />
                          </div>
                        </div>
                      )}
                      {composeDraft && (
                        <div className="w-48 space-y-1.5">
                          <Label>Date of Leaving</Label>
                          <Input type="date" value={composeLeavingDate} onChange={(e) => setComposeLeavingDate(e.target.value)} />
                        </div>
                      )}
                    </div>
                  )}

                  {isAdmitCards && values.exam_id && values.class_id && (
                    <div className="space-y-3 rounded-md border p-3">
                      {statusLoading && <p className="text-sm text-muted-foreground">Checking clearance status...</p>}
                      {!statusLoading && !!clearanceStatus?.length && (
                        <>
                          <p className="text-sm font-medium">
                            {clearanceStatus.length - blockedRows.length} of {clearanceStatus.length} students cleared
                            {!!blockedRows.length && ` — ${blockedRows.length} will be skipped`}
                          </p>
                          <div className="max-h-64 overflow-y-auto rounded-md border">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                                  {canOverride && !!blockedRows.length && <th className="w-8 p-2"></th>}
                                  <th className="p-2">Student</th>
                                  <th className="p-2">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {clearanceStatus.map((r) => (
                                  <tr key={r.student_id} className="border-b last:border-0">
                                    {canOverride && !!blockedRows.length && (
                                      <td className="p-2">
                                        {!r.clearance.all_clear && (
                                          <Checkbox checked={overrideSelected.has(r.student_id)} onCheckedChange={() => toggleOverride(r.student_id)} />
                                        )}
                                      </td>
                                    )}
                                    <td className="p-2">
                                      {r.name} <span className="text-xs text-muted-foreground">({r.student_uid})</span>
                                    </td>
                                    <td className="p-2">
                                      {r.clearance.all_clear ? (
                                        <Badge variant="success">Cleared</Badge>
                                      ) : (
                                        <Badge variant="destructive" title={blockReasons(r.clearance).join("; ")}>
                                          {blockReasons(r.clearance).join(", ")}
                                        </Badge>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {canOverride && !!blockedRows.length && (
                            <div className="space-y-1.5">
                              <Label>Override Reason {overrideSelected.size > 0 && "(required)"}</Label>
                              <Textarea
                                value={overrideReason}
                                onChange={(e) => setOverrideReason(e.target.value)}
                                placeholder="Why are the selected students being allowed to sit despite being blocked? This is recorded against their record."
                                disabled={overrideSelected.size === 0}
                              />
                              {overrideSelected.size > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {overrideSelected.size} student(s) will be included with this override, permanently recorded on their record.
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {error && <p className="text-sm text-red-600">{error}</p>}

                  <Button
                    disabled={!canGenerate || generating || (isAdmitCards && overrideSelected.size > 0 && !overrideReason.trim())}
                    onClick={download}
                  >
                    {generating ? "Generating..." : "Download PDF"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <RecordPickerDialog<StudentOption>
        open={pickerField?.kind === "select-student"}
        onOpenChange={(open) => !open && setPickerField(null)}
        title="Choose a Student"
        searchPlaceholder="Search by name or student ID..."
        getKey={(s) => s.id}
        filterKey={`${pickerClassId}:${pickerSectionId}`}
        filters={
          <>
            <select
              className="rounded-md border px-2 py-1.5 text-sm"
              value={pickerClassId}
              onChange={(e) => {
                setPickerClassId(e.target.value);
                setPickerSectionId("");
              }}
            >
              <option value="">All Classes</option>
              {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
            </select>
            <select
              className="rounded-md border px-2 py-1.5 text-sm"
              value={pickerSectionId}
              onChange={(e) => setPickerSectionId(e.target.value)}
              disabled={!pickerClassId}
            >
              <option value="">All Sections</option>
              {pickerSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </>
        }
        fetchResults={async ({ search, page }) =>
          (
            await api.get("/api/students", {
              params: { search: search || undefined, class_id: pickerClassId || undefined, section_id: pickerSectionId || undefined, page, limit: 10 },
            })
          ).data
        }
        renderRow={(s) => (
          <div>
            <p className="font-medium">{s.name_en}</p>
            <p className="text-xs text-muted-foreground">
              {s.student_uid}
              {s.current_class && ` · ${s.current_class.name_en}`}
              {s.current_section && ` ${s.current_section.name}`}
            </p>
          </div>
        )}
        onSelect={(s) => {
          if (!pickerField) return;
          setValue(pickerField.key, s.id);
          setLabels((prev) => ({ ...prev, [pickerField.key]: `${s.name_en} (${s.student_uid})` }));
          setPickerField(null);
        }}
      />

      <RecordPickerDialog<StaffOption>
        open={pickerField?.kind === "select-staff"}
        onOpenChange={(open) => !open && setPickerField(null)}
        title="Choose a Staff Member"
        searchPlaceholder="Search by name or staff ID..."
        getKey={(s) => s.id}
        fetchResults={async ({ search, page }) => (await api.get("/api/hr/staff", { params: { search: search || undefined, page, limit: 10 } })).data}
        renderRow={(s) => (
          <div>
            <p className="font-medium">{s.name_en}</p>
            <p className="text-xs text-muted-foreground">
              {s.staff_uid} · {s.designation}
            </p>
          </div>
        )}
        onSelect={(s) => {
          if (!pickerField) return;
          setValue(pickerField.key, s.id);
          setLabels((prev) => ({ ...prev, [pickerField.key]: `${s.name_en} (${s.staff_uid})` }));
          setPickerField(null);
        }}
      />
    </PageWrapper>
  );
}
