"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Option {
  id: string;
  name_en?: string;
  name?: string;
  label?: string;
  sections?: { id: string; name: string }[];
}

type FieldKind = "text" | "select-class" | "select-section" | "select-exam" | "select-year" | "date" | "month" | "year" | "number";

interface DocDef {
  key: string;
  title: string;
  description: string;
  endpoint: (params: Record<string, string>) => string;
  fields: { key: string; label: string; kind: FieldKind; required?: boolean }[];
}

const DOC_TYPES: DocDef[] = [
  {
    key: "student-id-card",
    title: "Student ID Card",
    description: "Single student ID card (front, 85.6×54mm).",
    endpoint: (p) => `/api/documents/student/${p.student_id}/id-card`,
    fields: [{ key: "student_id", label: "Student ID (system id)", kind: "text", required: true }],
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
    fields: [{ key: "staff_id", label: "Staff ID (system id)", kind: "text", required: true }],
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
      { key: "student_id", label: "Student ID (system id)", kind: "text", required: true },
    ],
  },
  {
    key: "marksheets-class",
    title: "Marksheets (Class)",
    description: "Bulk marksheets for every student in a class.",
    endpoint: (p) => `/api/documents/result/${p.exam_id}/marksheets/class/${p.class_id}`,
    fields: [
      { key: "exam_id", label: "Exam", kind: "select-exam", required: true },
      { key: "class_id", label: "Class", kind: "select-class", required: true },
    ],
  },
  {
    key: "report-card",
    title: "Report Card (Student)",
    description: "Single student report card with attendance summary.",
    endpoint: (p) => `/api/documents/result/${p.exam_id}/report-card/${p.student_id}`,
    fields: [
      { key: "exam_id", label: "Exam", kind: "select-exam", required: true },
      { key: "student_id", label: "Student ID (system id)", kind: "text", required: true },
    ],
  },
  {
    key: "tabulation-sheet",
    title: "Tabulation Sheet",
    description: "All students × all subjects for a class (A3 landscape).",
    endpoint: (p) => `/api/documents/result/${p.exam_id}/tabulation/${p.class_id}`,
    fields: [
      { key: "exam_id", label: "Exam", kind: "select-exam", required: true },
      { key: "class_id", label: "Class", kind: "select-class", required: true },
    ],
  },
  {
    key: "blank-marksheet",
    title: "Blank Marksheet",
    description: "Empty grid (all students × subjects) for manual mark entry, e.g. offline exam invigilation.",
    endpoint: (p) => `/api/documents/result/${p.exam_id}/blank-marksheet/${p.class_id}`,
    fields: [
      { key: "exam_id", label: "Exam", kind: "select-exam", required: true },
      { key: "class_id", label: "Class", kind: "select-class", required: true },
    ],
  },
  {
    key: "merit-list",
    title: "Merit List",
    description: "Ranked merit list for a class exam.",
    endpoint: (p) => `/api/documents/result/${p.exam_id}/merit-list/${p.class_id}`,
    fields: [
      { key: "exam_id", label: "Exam", kind: "select-exam", required: true },
      { key: "class_id", label: "Class", kind: "select-class", required: true },
    ],
  },
  {
    key: "testimonial",
    title: "Testimonial",
    description: "Character testimonial for a student.",
    endpoint: (p) => `/api/documents/student/${p.student_id}/testimonial`,
    fields: [{ key: "student_id", label: "Student ID (system id)", kind: "text", required: true }],
  },
  {
    key: "transfer-cert",
    title: "Transfer Certificate",
    description: "Formal BD-format transfer certificate.",
    endpoint: (p) => `/api/documents/student/${p.student_id}/transfer-cert`,
    fields: [{ key: "student_id", label: "Student ID (system id)", kind: "text", required: true }],
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
    endpoint: (p) => `/api/documents/fee/receipt/${p.payment_id}`,
    fields: [{ key: "payment_id", label: "Payment ID (system id)", kind: "text", required: true }],
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
    endpoint: (p) => `/api/documents/payroll/payslip/${p.payroll_record_id}`,
    fields: [{ key: "payroll_record_id", label: "Payroll Record ID (system id)", kind: "text", required: true }],
  },
];

export default function DocumentPrintCenterPage() {
  const [selectedKey, setSelectedKey] = useState(DOC_TYPES[0]!.key);
  const [values, setValues] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doc = DOC_TYPES.find((d) => d.key === selectedKey)!;

  const { data: classes } = useQuery<Option[]>({ queryKey: ["settings", "classes"], queryFn: async () => (await api.get("/api/settings/classes")).data.data });
  const sections = classes?.find((c) => c.id === values.class_id)?.sections ?? [];
  const { data: exams } = useQuery<Option[]>({ queryKey: ["exams"], queryFn: async () => (await api.get("/api/exams")).data.data });

  function setValue(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function selectDoc(key: string) {
    setSelectedKey(key);
    setValues({});
    setError(null);
  }

  const canGenerate = doc.fields.filter((f) => f.required).every((f) => values[f.key]);

  async function download() {
    setGenerating(true);
    setError(null);
    try {
      const path = doc.endpoint(values);
      const res = await api.get(path, { params: { download: "true" }, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.key}.pdf`;
      a.click();
    } catch {
      setError("Failed to generate document — check the required fields and try again.");
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
                    {f.kind === "select-exam" && (
                      <select className="w-full rounded-md border px-3 py-2 text-sm" value={values[f.key] ?? ""} onChange={(e) => setValue(f.key, e.target.value)}>
                        <option value="">Select...</option>
                        {exams?.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                      </select>
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

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button disabled={!canGenerate || generating} onClick={download}>
                {generating ? "Generating..." : "Download PDF"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageWrapper>
  );
}
