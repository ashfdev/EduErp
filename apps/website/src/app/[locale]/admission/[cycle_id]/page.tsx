"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/routing";
import { ErrorState } from "@education-erp/ui";
import {
  User, Users, FileText, BookOpen, Paperclip, CheckCheck,
  ChevronLeft, ChevronRight, Upload, CheckCircle2, AlertCircle,
  GraduationCap, Phone, Mail, MapPin, CreditCard, ArrowLeft,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface FormField {
  key: string; label_en: string; type: string; required: boolean; is_default: boolean; options?: string[];
}
interface CycleDetail {
  id: string; name: string; class: { name_en: string }; app_fee: number; seat_count: number; is_open: boolean;
  form_config: { fields: FormField[]; document_uploads: { key: string; label_en: string; required: boolean }[] } | null;
  subjects: { compulsory: { id: string; name_en: string }[]; optional: { id: string; name_en: string }[] };
}

const STEPS = [
  { label: "Personal Info", short: "Personal", icon: User },
  { label: "Guardian Info", short: "Guardian", icon: Users },
  { label: "Previous Record", short: "Record", icon: FileText },
  { label: "Subjects", short: "Subjects", icon: BookOpen },
  { label: "Documents", short: "Documents", icon: Paperclip },
  { label: "Review & Submit", short: "Review", icon: CheckCheck },
];

const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <div>
    <label className="block text-sm font-semibold text-slate-700 mb-2">
      {label}{required && <span className="ml-1 text-primary">*</span>}
    </label>
    {children}
  </div>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary/40 focus:bg-white focus:outline-none transition-all"
  />
);

const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) => (
  <select
    {...props}
    className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:border-primary/40 focus:bg-white focus:outline-none transition-all appearance-none"
  />
);

const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    {...props}
    className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary/40 focus:bg-white focus:outline-none transition-all resize-none"
  />
);

export default function AdmissionApplyPage() {
  const { cycle_id } = useParams<{ cycle_id: string }>();
  const [cycle, setCycle] = useState<CycleDetail | null>(null);
  const [cycleLoading, setCycleLoading] = useState(true);
  const [cycleError, setCycleError] = useState(false);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateApplication, setDuplicateApplication] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string; admission_roll: string; app_fee: number } | null>(null);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [applicantName, setApplicantName] = useState("");
  const [personalInfo, setPersonalInfo] = useState<Record<string, string>>({});
  const [guardian, setGuardian] = useState({ father_name: "", mother_name: "", phone: "", email: "", address: "" });
  const [previousResult, setPreviousResult] = useState({ institution: "", class_passed: "", gpa: "", gpa_scale: "5", marks_obtained: "", marks_total_out_of: "" });
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [documents, setDocuments] = useState<Record<string, string>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});

  async function handleDocumentSelect(key: string, file: File | undefined) {
    if (!file) return;
    setUploadingKey(key);
    setUploadErrors((p) => ({ ...p, [key]: "" }));
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/api/admission/upload-document`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) { setUploadErrors((p) => ({ ...p, [key]: body.error?.message ?? "Upload failed" })); return; }
      setDocuments((p) => ({ ...p, [key]: body.data.url }));
    } catch { setUploadErrors((p) => ({ ...p, [key]: "Could not reach the server." })); }
    finally { setUploadingKey(null); }
  }

  const loadCycle = useCallback(() => {
    setCycleLoading(true); setCycleError(false);
    fetch(`${API_URL}/api/admission/public/cycles/${cycle_id}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((b) => setCycle(b.data ?? null))
      .catch(() => setCycleError(true))
      .finally(() => setCycleLoading(false));
  }, [cycle_id]);

  useEffect(() => { loadCycle(); }, [loadCycle]);

  async function submit() {
    setSubmitting(true); setError(null); setDuplicateApplication(false);
    try {
      const res = await fetch(`${API_URL}/api/admission/apply`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycle_id, applicant_name: applicantName, guardian_info: guardian,
          personal_info: personalInfo,
          previous_result: previousResult.institution || previousResult.gpa
            ? { institution: previousResult.institution, class_passed: previousResult.class_passed, gpa: previousResult.gpa ? Number(previousResult.gpa) : undefined, gpa_scale: previousResult.gpa_scale, marks_obtained: previousResult.marks_obtained ? Number(previousResult.marks_obtained) : undefined, marks_total_out_of: previousResult.marks_total_out_of ? Number(previousResult.marks_total_out_of) : undefined }
            : undefined,
          selected_subjects: selectedSubjects, documents,
        }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error?.message ?? "Failed to submit application"); if (res.status === 409) setDuplicateApplication(true); return; }
      setSubmitted(body.data);
    } catch { setError("Could not reach the server — please try again."); }
    finally { setSubmitting(false); }
  }

  async function payNow(gateway: "BKASH" | "NAGAD" | "SSLCOMMERZ") {
    if (!submitted) return;
    setPaying(true); setPaymentError(null);
    try {
      const res = await fetch(`${API_URL}/api/admission/payment/initiate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ application_id: submitted.id, gateway }) });
      const body = await res.json();
      if (!res.ok) { setPaymentError(body.error?.message ?? "Could not start payment"); return; }
      if (body.data?.payment_url) window.location.href = body.data.payment_url;
    } catch { setPaymentError("Could not reach the server."); }
    finally { setPaying(false); }
  }

  function getValidationMessage(i: number): string | null {
    if (i === 0) {
      if (!applicantName.trim()) return "Please enter the applicant's full name.";
      const req = (cycle?.form_config?.fields ?? []).filter((f) => !f.is_default && f.required);
      if (!req.every((f) => !!personalInfo[f.key])) return "Please fill in all required fields.";
    }
    if (i === 1 && !/^01\d{9}$/.test(guardian.phone)) return "Enter a valid guardian phone number (01XXXXXXXXX).";
    if (i === 4) {
      const missing = (cycle?.form_config?.document_uploads ?? []).filter((d) => d.required && !documents[d.key]);
      if (missing.length) return `Please upload: ${missing.map((d) => d.label_en).join(", ")}`;
    }
    return null;
  }

  function tryNext() {
    const msg = getValidationMessage(step);
    if (msg) { setValidationError(msg); return; }
    setValidationError(null);
    setStep((s) => s + 1);
  }

  // ── Special states ──
  if (cycleError) return (
    <main className="min-h-[60vh] flex items-center justify-center p-8">
      <ErrorState title="Couldn't load this admission cycle" description="Check your connection and try again." retryLabel="Retry" onRetry={loadCycle} />
    </main>
  );

  if (cycleLoading || !cycle) return (
    <main className="min-h-screen bg-[#f0fdf4] flex items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-green-100 border-t-primary animate-spin" />
        <p className="text-slate-500 text-sm">Loading admission form…</p>
      </div>
    </main>
  );

  if (!cycle.is_open) return (
    <main className="min-h-[60vh] bg-[#f0fdf4] flex items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-white flex items-center justify-center shadow-sm border border-green-100"><GraduationCap className="h-8 w-8 text-slate-400" /></div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Admissions Closed</h2>
        <p className="text-sm text-slate-500 mb-4">This admission cycle is not currently open for applications.</p>
        <Link href="/admission" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> View open admissions</Link>
      </div>
    </main>
  );

  if (submitted) return (
    <main className="min-h-screen bg-[#f0fdf4] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl border border-green-100 shadow-sm p-8 text-center">
          <div className="mx-auto mb-5 h-20 w-20 rounded-full bg-green-50 flex items-center justify-center"><CheckCircle2 className="h-10 w-10 text-primary" /></div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Application Submitted!</h1>
          <p className="text-slate-500 text-sm mb-6">Your application has been received successfully.</p>
          <div className="bg-[#f0fdf4] rounded-2xl border border-green-100 p-5 mb-6 space-y-3">
            <div className="flex justify-between"><span className="text-xs font-semibold text-slate-500">Admission Roll</span><span className="font-mono font-bold text-lg text-slate-900">{submitted.admission_roll}</span></div>
            <div className="flex justify-between"><span className="text-xs font-semibold text-slate-500">Class</span><span className="text-sm font-semibold text-slate-700">{cycle.class.name_en}</span></div>
          </div>
          <p className="text-xs text-slate-400 mb-6">Save your roll number — you&apos;ll need it to check your status.</p>
          {submitted.app_fee > 0 && (
            <div className="border border-slate-100 rounded-2xl p-5 mb-5 text-left">
              <p className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /> Fee: ৳{submitted.app_fee}</p>
              <p className="text-xs text-slate-500 mb-4">Pay to complete your application.</p>
              <div className="grid grid-cols-3 gap-2">
                {(["BKASH", "NAGAD", "SSLCOMMERZ"] as const).map((g) => (
                  <button key={g} disabled={paying} onClick={() => payNow(g)} className="rounded-xl border border-green-200 bg-[#f0fdf4] py-2 text-xs font-bold text-green-800 hover:bg-green-100 transition disabled:opacity-50">
                    {g === "SSLCOMMERZ" ? "SSLCommerz" : g.charAt(0) + g.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              {paymentError && <p className="mt-2 text-xs text-red-500">{paymentError}</p>}
            </div>
          )}
          <Link href="/admission/status" className="text-sm font-semibold text-primary hover:underline">Check Application Status →</Link>
        </div>
      </div>
    </main>
  );

  const customFields = (cycle.form_config?.fields ?? []).filter((f) => !f.is_default);
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <main className="min-h-screen bg-[#f0fdf4]">
      {/* ── Top header bar ── */}
      <div className="bg-white border-b border-green-100 px-4 py-4">
        <div className="mx-auto max-w-5xl">
          <Link href="/admission" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-primary mb-3 transition">
            <ArrowLeft className="h-3.5 w-3.5" /> All Admissions
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{cycle.name}</h1>
              <div className="flex flex-wrap items-center gap-4 mt-2">
                <span className="flex items-center gap-1.5 text-sm text-slate-500"><GraduationCap className="h-4 w-4 text-primary" /> {cycle.class.name_en}</span>
                <span className="flex items-center gap-1.5 text-sm text-slate-500"><Users className="h-4 w-4 text-primary" /> {cycle.seat_count} seats</span>
                {cycle.app_fee > 0 && <span className="flex items-center gap-1.5 text-sm text-slate-500"><CreditCard className="h-4 w-4 text-primary" /> ৳{cycle.app_fee} fee</span>}
              </div>
            </div>
            <span className="text-sm font-semibold text-primary">Step {step + 1} of {STEPS.length}</span>
          </div>
          {/* Progress bar */}
          <div className="mt-4 h-2 w-full rounded-full bg-green-100 overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 flex flex-col lg:flex-row gap-8">

        {/* ── Left: Step sidebar ── */}
        <aside className="lg:w-56 shrink-0">
          <div className="bg-white rounded-3xl border border-green-100 shadow-sm p-4 sticky top-24">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2 mb-3">Steps</p>
            <nav className="flex flex-col gap-1">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const done = i < step;
                const active = i === step;
                return (
                  <div key={s.label} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all ${active ? "bg-primary/10 text-primary" : done ? "text-green-600" : "text-slate-400"}`}>
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? "bg-primary text-white" : done ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"}`}>
                      {done ? <CheckCheck className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    </div>
                    <span className={`text-sm font-semibold ${active ? "text-primary" : done ? "text-green-700" : "text-slate-400"}`}>{s.label}</span>
                  </div>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* ── Right: Form panel ── */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-3xl border border-green-100 shadow-sm p-6 sm:p-8">

            {/* Step heading */}
            <div className="flex items-center gap-3 mb-8 pb-6 border-b border-slate-100">
              {(() => { const Icon = STEPS[step]?.icon ?? User; return <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-primary" /></div>; })()}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Step {step + 1}</p>
                <h2 className="text-xl font-bold text-slate-900">{STEPS[step]?.label}</h2>
              </div>
            </div>

            {/* ── Step 0: Personal Info ── */}
            {step === 0 && (
              <div className="space-y-5">
                <Field label="Full Name" required>
                  <Input required placeholder="e.g. Md. Ariful Islam" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="Gender">
                    <Select value={personalInfo.gender ?? ""} onChange={(e) => setPersonalInfo((p) => ({ ...p, gender: e.target.value }))}>
                      <option value="">Select gender</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </Select>
                  </Field>
                  <Field label="Date of Birth">
                    <Input type="date" value={personalInfo.date_of_birth ?? ""} onChange={(e) => setPersonalInfo((p) => ({ ...p, date_of_birth: e.target.value }))} />
                  </Field>
                </div>
                <Field label="Student Phone">
                  <Input placeholder="01XXXXXXXXX (optional, for portal login)" value={personalInfo.phone ?? ""} onChange={(e) => setPersonalInfo((p) => ({ ...p, phone: e.target.value }))} />
                </Field>
                {customFields.map((f) => (
                  <Field key={f.key} label={f.label_en} required={f.required}>
                    <Input required={f.required} placeholder={f.label_en} value={personalInfo[f.key] ?? ""} onChange={(e) => setPersonalInfo((p) => ({ ...p, [f.key]: e.target.value }))} />
                  </Field>
                ))}
              </div>
            )}

            {/* ── Step 1: Guardian Info ── */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="Father's Name">
                    <Input placeholder="Father's full name" value={guardian.father_name} onChange={(e) => setGuardian((g) => ({ ...g, father_name: e.target.value }))} />
                  </Field>
                  <Field label="Mother's Name">
                    <Input placeholder="Mother's full name" value={guardian.mother_name} onChange={(e) => setGuardian((g) => ({ ...g, mother_name: e.target.value }))} />
                  </Field>
                </div>
                <Field label="Guardian Phone" required>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input required placeholder="01XXXXXXXXX" value={guardian.phone} onChange={(e) => setGuardian((g) => ({ ...g, phone: e.target.value }))}
                      className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 pl-11 pr-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary/40 focus:bg-white focus:outline-none transition-all" />
                  </div>
                  {guardian.phone && !/^01\d{9}$/.test(guardian.phone) && <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Must be 11 digits starting with 01</p>}
                </Field>
                <Field label="Email">
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input placeholder="guardian@email.com (optional)" value={guardian.email} onChange={(e) => setGuardian((g) => ({ ...g, email: e.target.value }))}
                      className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 pl-11 pr-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary/40 focus:bg-white focus:outline-none transition-all" />
                  </div>
                </Field>
                <Field label="Address">
                  <div className="relative">
                    <MapPin className="absolute left-4 top-4 h-4 w-4 text-slate-400" />
                    <textarea rows={3} placeholder="Full address" value={guardian.address} onChange={(e) => setGuardian((g) => ({ ...g, address: e.target.value }))}
                      className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 pl-11 pr-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary/40 focus:bg-white focus:outline-none transition-all resize-none" />
                  </div>
                </Field>
              </div>
            )}

            {/* ── Step 2: Previous Record ── */}
            {step === 2 && (
              <div className="space-y-5">
                <Field label="Previous Institution">
                  <Input placeholder="School / Madrasah name" value={previousResult.institution} onChange={(e) => setPreviousResult((p) => ({ ...p, institution: e.target.value }))} />
                </Field>
                <Field label="Class Passed">
                  <Input placeholder="e.g. Class 5" value={previousResult.class_passed} onChange={(e) => setPreviousResult((p) => ({ ...p, class_passed: e.target.value }))} />
                </Field>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">GPA</label>
                  <div className="grid grid-cols-2 gap-4">
                    <Input type="number" step="0.01" placeholder="GPA (e.g. 4.75)" value={previousResult.gpa} onChange={(e) => setPreviousResult((p) => ({ ...p, gpa: e.target.value }))} />
                    <Select value={previousResult.gpa_scale} onChange={(e) => setPreviousResult((p) => ({ ...p, gpa_scale: e.target.value }))}>
                      <option value="5">Out of 5.00</option>
                      <option value="4">Out of 4.00</option>
                      <option value="OTHER">Other scale</option>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Total Marks</label>
                  <div className="grid grid-cols-2 gap-4">
                    <Input type="number" placeholder="Marks obtained" value={previousResult.marks_obtained} onChange={(e) => setPreviousResult((p) => ({ ...p, marks_obtained: e.target.value }))} />
                    <Input type="number" placeholder="Out of (e.g. 500)" value={previousResult.marks_total_out_of} onChange={(e) => setPreviousResult((p) => ({ ...p, marks_total_out_of: e.target.value }))} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 3: Subjects ── */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="rounded-2xl bg-[#f0fdf4] border border-green-100 p-5">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Compulsory Subjects</p>
                  <div className="flex flex-wrap gap-2">
                    {cycle.subjects.compulsory.map((s) => (
                      <span key={s.id} className="rounded-full border border-green-200 bg-white px-4 py-1.5 text-sm font-semibold text-green-800">{s.name_en}</span>
                    ))}
                    {!cycle.subjects.compulsory.length && <p className="text-sm text-slate-400">None specified</p>}
                  </div>
                </div>
                {cycle.subjects.optional.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Optional Subjects <span className="normal-case font-normal text-slate-400">— select one or more</span></p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {cycle.subjects.optional.map((s) => {
                        const checked = selectedSubjects.includes(s.id);
                        return (
                          <label key={s.id} className={`flex items-center gap-3 rounded-2xl border-2 p-4 cursor-pointer transition-all ${checked ? "border-primary bg-primary/5" : "border-slate-100 bg-slate-50 hover:border-green-200"}`}>
                            <input type="checkbox" checked={checked} onChange={(e) => setSelectedSubjects((prev) => e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id))} className="accent-green-600 h-4 w-4" />
                            <span className={`text-sm font-semibold ${checked ? "text-primary" : "text-slate-700"}`}>{s.name_en}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 4: Documents ── */}
            {step === 4 && (
              <div className="space-y-5">
                <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-xs text-slate-500">
                  Accepted: JPG, PNG, WebP or PDF — max 10 MB each.
                </div>
                {!(cycle.form_config?.document_uploads ?? []).length && (
                  <div className="rounded-2xl bg-[#f0fdf4] border border-green-100 p-8 text-center">
                    <CheckCircle2 className="h-10 w-10 text-primary mx-auto mb-3" />
                    <p className="font-semibold text-slate-700">No documents required</p>
                  </div>
                )}
                {(cycle.form_config?.document_uploads ?? []).map((d) => (
                  <div key={d.key}>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">{d.label_en}{d.required && <span className="ml-1 text-primary">*</span>}</label>
                    <label className={`flex items-center gap-4 rounded-2xl border-2 border-dashed p-5 cursor-pointer transition-all ${documents[d.key] ? "border-green-300 bg-green-50" : "border-slate-200 bg-slate-50 hover:border-primary/40 hover:bg-white"}`}>
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${documents[d.key] ? "bg-green-100" : "bg-white border border-slate-200"}`}>
                        {uploadingKey === d.key ? <div className="h-4 w-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" /> : documents[d.key] ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Upload className="h-4 w-4 text-slate-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${documents[d.key] ? "text-green-700" : "text-slate-600"}`}>
                          {uploadingKey === d.key ? "Uploading…" : documents[d.key] ? "File uploaded successfully" : "Click to upload"}
                        </p>
                        {documents[d.key] && <a href={documents[d.key]} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Preview file</a>}
                      </div>
                      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={uploadingKey === d.key} onChange={(e) => handleDocumentSelect(d.key, e.target.files?.[0])} className="sr-only" />
                    </label>
                    {uploadErrors[d.key] && <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {uploadErrors[d.key]}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* ── Step 5: Review ── */}
            {step === 5 && (
              <div className="space-y-4">
                <div className="rounded-2xl overflow-hidden border border-slate-100 divide-y divide-slate-100">
                  {[
                    { label: "Applicant Name", value: applicantName || "—" },
                    { label: "Class", value: cycle.class.name_en },
                    { label: "Guardian Phone", value: guardian.phone || "—" },
                    { label: "Father's Name", value: guardian.father_name || "—" },
                    { label: "Mother's Name", value: guardian.mother_name || "—" },
                    { label: "Application Fee", value: cycle.app_fee > 0 ? `৳${cycle.app_fee}` : "Free" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between items-center px-5 py-3.5 bg-white odd:bg-[#f0fdf4]/40">
                      <span className="text-sm text-slate-500">{label}</span>
                      <span className="text-sm font-bold text-slate-800">{value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 text-center">Review carefully — you cannot edit after submission.</p>
              </div>
            )}

            {/* ── Validation / Submit error ── */}
            {(validationError || error) && (
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3.5">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-700">{validationError ?? error}</p>
                  {duplicateApplication && (
                    <Link href="/admission/status" className="mt-1 text-xs font-semibold text-red-700 underline">Check your application status →</Link>
                  )}
                </div>
              </div>
            )}

            {/* ── Navigation buttons ── */}
            <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between items-center">
              <button
                disabled={step === 0}
                onClick={() => { setValidationError(null); setStep((s) => s - 1); }}
                className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:invisible transition"
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>

              {step < STEPS.length - 1 ? (
                <button
                  onClick={tryNext}
                  className="flex items-center gap-2 rounded-2xl bg-primary px-8 py-3 text-sm font-bold text-white hover:bg-primary/90 active:scale-95 transition shadow-sm shadow-green-200"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  disabled={submitting || !!uploadingKey}
                  onClick={submit}
                  className="flex items-center gap-2 rounded-2xl bg-primary px-8 py-3 text-sm font-bold text-white hover:bg-primary/90 active:scale-95 disabled:opacity-60 transition shadow-sm shadow-green-200"
                >
                  {submitting ? <><div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Submitting…</> : <><CheckCheck className="h-4 w-4" /> Submit Application</>}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
