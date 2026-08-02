"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/routing";
import { ErrorState } from "@education-erp/ui";
import {
  User, Users, FileText, Paperclip, CheckCheck,
  ChevronLeft, ChevronRight, Upload, CheckCircle2, AlertCircle,
  GraduationCap, Phone, Mail, MapPin, CreditCard, ArrowLeft,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface FormField {
  key: string; label_en: string; type: string; required: boolean; is_default: boolean; options?: string[];
}

type StagedDoc = {
  doc_type: "BIRTH_CERTIFICATE" | "NID" | "MARKSHEET" | "TESTIMONIAL" | "TRANSFER_CERTIFICATE" | "OTHER";
  slot?: "FRONT" | "BACK";
  label_key?: string;
  blob_key: string;
  preview_url: string;
  original_filename: string;
  mime_type: string;
};

// One upload slot, reused for every document row in the Documents step's
// table (Plan Twenty-Three, Phase 2) — hideLabel skips the redundant inline
// label when the row's own left-column label already names the document.
function DocSlot({ label, doc, uploading, error, onSelect, hideLabel }: {
  label: string; rowKey: string; doc: StagedDoc | undefined; uploading: boolean; error: string | undefined;
  onSelect: (file: File | undefined) => void; hideLabel?: boolean;
}) {
  return (
    <div>
      <label className={`flex items-center gap-3 rounded-xl border-2 border-dashed p-3 cursor-pointer transition-all ${doc ? "border-green-300 bg-green-50" : "border-slate-200 bg-slate-50 hover:border-primary/40 hover:bg-white"}`}>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${doc ? "bg-green-100" : "bg-white border border-slate-200"}`}>
          {uploading ? <div className="h-3.5 w-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" /> : doc ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Upload className="h-3.5 w-3.5 text-slate-400" />}
        </div>
        <div className="flex-1 min-w-0">
          {!hideLabel && <p className={`text-xs font-bold ${doc ? "text-green-700" : "text-slate-500"}`}>{label}</p>}
          <p className={`text-xs ${doc ? "text-green-700 font-semibold" : "text-slate-500"}`}>
            {uploading ? "Uploading…" : doc ? doc.original_filename : "Click to upload"}
          </p>
          {doc && <a href={doc.preview_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-[11px] text-primary underline">Preview</a>}
        </div>
        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={uploading} onChange={(e) => onSelect(e.target.files?.[0])} className="sr-only" />
      </label>
      {error && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {error}</p>}
    </div>
  );
}
interface CycleDetail {
  id: string; name: string; class: { name_en: string }; app_fee: number; seat_count: number; is_open: boolean;
  form_config: { fields: FormField[]; document_uploads: { key: string; label_en: string; required: boolean }[] } | null;
  subjects: { compulsory: { id: string; name_en: string }[]; optional: { id: string; name_en: string }[] };
}

// Subjects deliberately removed (Plan Twenty-Three, Phase 1) -- compulsory
// subjects auto-inherit server-side at enroll time regardless of anything
// collected here, and optional-subject selection is a post-enrollment admin
// task like it already is for every other student today. An applicant only
// needs to see which class/cycle they're applying to, already shown in the
// header above this stepper.
const STEPS = [
  { label: "Personal Info", short: "Personal", icon: User },
  { label: "Guardian Info", short: "Guardian", icon: Users },
  { label: "Previous Record", short: "Record", icon: FileText },
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
  const [validationError, setValidationError] = useState<string | null>(null);

  const [applicantName, setApplicantName] = useState("");
  const [personalInfo, setPersonalInfo] = useState<Record<string, string>>({});
  const [guardian, setGuardian] = useState({ father_name: "", mother_name: "", phone: "", email: "", address: "" });
  const [previousResult, setPreviousResult] = useState({ institution: "", class_passed: "", gpa: "", gpa_scale: "5", marks_obtained: "", marks_total_out_of: "" });

  // Documents/photo (Plan Twenty-Three, Phase 2) — a fixed base document
  // set plus any cycle-specific extras, staged client-side keyed by a local
  // row key ("BIRTH_CERTIFICATE" | "NID_FRONT" | "NID_BACK" | "MARKSHEET" |
  // "TESTIMONIAL" | "TRANSFER_CERTIFICATE" | `extra:${cycleDocKey}`) until
  // the final submit, which sends the whole staged set as one array.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [identityType, setIdentityType] = useState<"BIRTH_CERTIFICATE" | "NID">("BIRTH_CERTIFICATE");
  const [stagedDocs, setStagedDocs] = useState<Record<string, StagedDoc>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});

  async function handlePhotoSelect(file: File | undefined) {
    if (!file) return;
    setUploadingPhoto(true);
    setPhotoError(null);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch(`${API_URL}/api/admission/upload-photo`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) { setPhotoError(body.error?.message ?? "Upload failed"); return; }
      setPhotoUrl(body.data.photo_url);
    } catch { setPhotoError("Could not reach the server."); }
    finally { setUploadingPhoto(false); }
  }

  async function handleDocumentSelect(rowKey: string, docType: StagedDoc["doc_type"], slot: "FRONT" | "BACK" | undefined, labelKey: string | undefined, file: File | undefined) {
    if (!file) return;
    setUploadingKey(rowKey);
    setUploadErrors((p) => ({ ...p, [rowKey]: "" }));
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/api/admission/upload-document`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) { setUploadErrors((p) => ({ ...p, [rowKey]: body.error?.message ?? "Upload failed" })); return; }
      setStagedDocs((p) => ({
        ...p,
        [rowKey]: { doc_type: docType, slot, label_key: labelKey, blob_key: body.data.blob_key, preview_url: body.data.preview_url, original_filename: body.data.original_filename, mime_type: body.data.mime_type },
      }));
    } catch { setUploadErrors((p) => ({ ...p, [rowKey]: "Could not reach the server." })); }
    finally { setUploadingKey(null); }
  }

  function switchIdentityType(next: "BIRTH_CERTIFICATE" | "NID") {
    setIdentityType(next);
    // Clear whichever type's staged file(s) no longer apply, so a stale
    // upload from before switching the toggle is never silently submitted.
    setStagedDocs((p) => {
      const copy = { ...p };
      delete copy.BIRTH_CERTIFICATE;
      delete copy.NID_FRONT;
      delete copy.NID_BACK;
      return copy;
    });
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
          photo_url: photoUrl,
          identity_type: identityType,
          uploaded_documents: Object.values(stagedDocs).map((d) => ({
            doc_type: d.doc_type, slot: d.slot, label_key: d.label_key,
            blob_key: d.blob_key, original_filename: d.original_filename, mime_type: d.mime_type,
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error?.message ?? "Failed to submit application"); if (res.status === 409) setDuplicateApplication(true); return; }
      setSubmitted(body.data);
    } catch { setError("Could not reach the server — please try again."); }
    finally { setSubmitting(false); }
  }


  function getValidationMessage(i: number): string | null {
    if (i === 0) {
      if (!applicantName.trim()) return "Please enter the applicant's full name.";
      const req = (cycle?.form_config?.fields ?? []).filter((f) => !f.is_default && f.required);
      if (!req.every((f) => !!personalInfo[f.key])) return "Please fill in all required fields.";
    }
    if (i === 1 && !/^01\d{9}$/.test(guardian.phone)) return "Enter a valid guardian phone number (01XXXXXXXXX).";
    if (i === 3) {
      if (!photoUrl) return "Please upload a student photo.";
      if (identityType === "BIRTH_CERTIFICATE" && !stagedDocs.BIRTH_CERTIFICATE) return "Please upload the Birth Certificate.";
      if (identityType === "NID" && (!stagedDocs.NID_FRONT || !stagedDocs.NID_BACK)) return "Please upload both sides of the NID.";
      if (!stagedDocs.MARKSHEET) return "Please upload the previous class's pass transcript/result card.";
      const missing = (cycle?.form_config?.document_uploads ?? []).filter((d) => d.required && !stagedDocs[`extra:${d.key}`]);
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
              <p className="text-xs text-slate-500 mb-4">Your application won&apos;t be shortlisted until this is paid. Pay now on the status page.</p>
              <Link
                href={`/admission/status?admission_roll=${encodeURIComponent(submitted.admission_roll)}&phone=${encodeURIComponent(guardian.phone)}`}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 transition"
              >
                <CreditCard className="h-4 w-4" /> Pay Now
              </Link>
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

            {/* ── Step 3: Documents ── */}
            {step === 3 && (
              <div className="space-y-5">
                <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-xs text-slate-500">
                  Accepted: JPG, PNG, WebP or PDF — max 10 MB each.
                </div>

                {/* Rendered as a real row-per-document table/form, not a
                    dropdown, per the explicit ask. */}
                <div className="rounded-2xl border border-slate-100 divide-y divide-slate-100 overflow-hidden">

                  {/* Photo — required, its own dedicated slot */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                    <div className="sm:w-48 shrink-0">
                      <p className="text-sm font-semibold text-slate-700">Student Photo <span className="text-primary">*</span></p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className={`flex items-center gap-4 rounded-2xl border-2 border-dashed p-4 cursor-pointer transition-all ${photoUrl ? "border-green-300 bg-green-50" : "border-slate-200 bg-slate-50 hover:border-primary/40 hover:bg-white"}`}>
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${photoUrl ? "bg-green-100" : "bg-white border border-slate-200"}`}>
                          {uploadingPhoto ? <div className="h-4 w-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" /> : photoUrl ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Upload className="h-4 w-4 text-slate-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${photoUrl ? "text-green-700" : "text-slate-600"}`}>{uploadingPhoto ? "Uploading…" : photoUrl ? "Photo uploaded" : "Click to upload"}</p>
                          {photoUrl && <a href={photoUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Preview</a>}
                        </div>
                        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingPhoto} onChange={(e) => handlePhotoSelect(e.target.files?.[0])} className="sr-only" />
                      </label>
                      {photoError && <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {photoError}</p>}
                    </div>
                  </div>

                  {/* Identity: Birth Certificate OR NID, toggle picks which */}
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-4">
                    <div className="sm:w-48 shrink-0">
                      <p className="text-sm font-semibold text-slate-700">Identity Document <span className="text-primary">*</span></p>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => switchIdentityType("BIRTH_CERTIFICATE")} className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${identityType === "BIRTH_CERTIFICATE" ? "bg-primary text-white" : "bg-slate-100 text-slate-500"}`}>Birth Certificate</button>
                        <button type="button" onClick={() => switchIdentityType("NID")} className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${identityType === "NID" ? "bg-primary text-white" : "bg-slate-100 text-slate-500"}`}>NID</button>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 space-y-3">
                      {identityType === "BIRTH_CERTIFICATE" ? (
                        <DocSlot label="Birth Certificate" rowKey="BIRTH_CERTIFICATE" doc={stagedDocs.BIRTH_CERTIFICATE} uploading={uploadingKey === "BIRTH_CERTIFICATE"} error={uploadErrors.BIRTH_CERTIFICATE}
                          onSelect={(f) => handleDocumentSelect("BIRTH_CERTIFICATE", "BIRTH_CERTIFICATE", undefined, undefined, f)} />
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <DocSlot label="NID — Front" rowKey="NID_FRONT" doc={stagedDocs.NID_FRONT} uploading={uploadingKey === "NID_FRONT"} error={uploadErrors.NID_FRONT}
                            onSelect={(f) => handleDocumentSelect("NID_FRONT", "NID", "FRONT", undefined, f)} />
                          <DocSlot label="NID — Back" rowKey="NID_BACK" doc={stagedDocs.NID_BACK} uploading={uploadingKey === "NID_BACK"} error={uploadErrors.NID_BACK}
                            onSelect={(f) => handleDocumentSelect("NID_BACK", "NID", "BACK", undefined, f)} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Previous result transcript — required */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                    <div className="sm:w-48 shrink-0"><p className="text-sm font-semibold text-slate-700">Previous Result / Transcript <span className="text-primary">*</span></p></div>
                    <div className="flex-1 min-w-0">
                      <DocSlot label="Marksheet / Result Card" rowKey="MARKSHEET" doc={stagedDocs.MARKSHEET} uploading={uploadingKey === "MARKSHEET"} error={uploadErrors.MARKSHEET}
                        onSelect={(f) => handleDocumentSelect("MARKSHEET", "MARKSHEET", undefined, undefined, f)} hideLabel />
                    </div>
                  </div>

                  {/* Testimonial — optional */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                    <div className="sm:w-48 shrink-0"><p className="text-sm font-semibold text-slate-700">Testimonial <span className="text-slate-400 font-normal">(optional)</span></p></div>
                    <div className="flex-1 min-w-0">
                      <DocSlot label="Testimonial" rowKey="TESTIMONIAL" doc={stagedDocs.TESTIMONIAL} uploading={uploadingKey === "TESTIMONIAL"} error={uploadErrors.TESTIMONIAL}
                        onSelect={(f) => handleDocumentSelect("TESTIMONIAL", "TESTIMONIAL", undefined, undefined, f)} hideLabel />
                    </div>
                  </div>

                  {/* Transfer Certificate — optional */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                    <div className="sm:w-48 shrink-0"><p className="text-sm font-semibold text-slate-700">Transfer Certificate <span className="text-slate-400 font-normal">(optional)</span></p></div>
                    <div className="flex-1 min-w-0">
                      <DocSlot label="Transfer Certificate" rowKey="TRANSFER_CERTIFICATE" doc={stagedDocs.TRANSFER_CERTIFICATE} uploading={uploadingKey === "TRANSFER_CERTIFICATE"} error={uploadErrors.TRANSFER_CERTIFICATE}
                        onSelect={(f) => handleDocumentSelect("TRANSFER_CERTIFICATE", "TRANSFER_CERTIFICATE", undefined, undefined, f)} hideLabel />
                    </div>
                  </div>

                  {/* Cycle-specific extras, if this cycle's admin configured any */}
                  {(cycle.form_config?.document_uploads ?? []).map((d) => (
                    <div key={d.key} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                      <div className="sm:w-48 shrink-0"><p className="text-sm font-semibold text-slate-700">{d.label_en} {d.required ? <span className="text-primary">*</span> : <span className="text-slate-400 font-normal">(optional)</span>}</p></div>
                      <div className="flex-1 min-w-0">
                        <DocSlot label={d.label_en} rowKey={`extra:${d.key}`} doc={stagedDocs[`extra:${d.key}`]} uploading={uploadingKey === `extra:${d.key}`} error={uploadErrors[`extra:${d.key}`]}
                          onSelect={(f) => handleDocumentSelect(`extra:${d.key}`, "OTHER", undefined, d.key, f)} hideLabel />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Step 4: Review ── */}
            {step === 4 && (
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
