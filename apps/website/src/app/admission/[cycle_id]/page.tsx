"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface FormField {
  key: string;
  label_en: string;
  type: string;
  required: boolean;
  is_default: boolean;
  options?: string[];
}

interface CycleDetail {
  id: string;
  name: string;
  class: { name_en: string };
  app_fee: number;
  seat_count: number;
  is_open: boolean;
  form_config: { fields: FormField[]; document_uploads: { key: string; label_en: string; required: boolean }[] } | null;
  subjects: { compulsory: { id: string; name_en: string }[]; optional: { id: string; name_en: string }[] };
}

const STEPS = ["Personal Info", "Guardian Info", "Previous Record", "Subjects", "Documents", "Review & Submit"];

export default function AdmissionApplyPage() {
  const { cycle_id } = useParams<{ cycle_id: string }>();
  const [cycle, setCycle] = useState<CycleDetail | null>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ id: string; admission_roll: string; app_fee: number } | null>(null);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

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
    setUploadErrors((prev) => ({ ...prev, [key]: "" }));
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/api/admission/upload-document`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setUploadErrors((prev) => ({ ...prev, [key]: body.error?.message ?? "Upload failed" }));
        return;
      }
      setDocuments((prev) => ({ ...prev, [key]: body.data.url }));
    } catch {
      setUploadErrors((prev) => ({ ...prev, [key]: "Could not reach the server — please try again." }));
    } finally {
      setUploadingKey(null);
    }
  }

  useEffect(() => {
    fetch(`${API_URL}/api/admission/public/cycles/${cycle_id}`)
      .then((r) => r.json())
      .then((body) => setCycle(body.data ?? null))
      .catch(() => setCycle(null));
  }, [cycle_id]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admission/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycle_id,
          applicant_name: applicantName,
          guardian_info: guardian,
          personal_info: personalInfo,
          previous_result: previousResult.institution || previousResult.gpa
            ? {
                institution: previousResult.institution,
                class_passed: previousResult.class_passed,
                gpa: previousResult.gpa ? Number(previousResult.gpa) : undefined,
                gpa_scale: previousResult.gpa_scale,
                marks_obtained: previousResult.marks_obtained ? Number(previousResult.marks_obtained) : undefined,
                marks_total_out_of: previousResult.marks_total_out_of ? Number(previousResult.marks_total_out_of) : undefined,
              }
            : undefined,
          selected_subjects: selectedSubjects,
          documents,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error?.message ?? "Failed to submit application");
        return;
      }
      setSubmitted(body.data);
    } catch {
      setError("Could not reach the server — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function payNow(gateway: "BKASH" | "NAGAD" | "SSLCOMMERZ") {
    if (!submitted) return;
    setPaying(true);
    setPaymentError(null);
    try {
      const res = await fetch(`${API_URL}/api/admission/payment/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: submitted.id, gateway }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPaymentError(body.error?.message ?? "Could not start payment");
        return;
      }
      if (body.data?.payment_url) {
        window.location.href = body.data.payment_url;
      }
    } catch {
      setPaymentError("Could not reach the server — please try again.");
    } finally {
      setPaying(false);
    }
  }

  // Real per-step validation — previously only step 0 was gated (via the
  // Next button's disabled check below), so a user could click through
  // steps 1-4 with required fields empty and only find out from a late,
  // confusing server-side 400 on final submit. There was also no <form>
  // element at all, so HTML5 `required` attributes on the inputs never did
  // anything on their own.
  function isStepValid(i: number): boolean {
    if (i === 0) {
      if (!applicantName.trim()) return false;
      const requiredCustomFields = (cycle?.form_config?.fields ?? []).filter((f) => !f.is_default && f.required);
      return requiredCustomFields.every((f) => !!personalInfo[f.key]);
    }
    if (i === 1) return /^01\d{9}$/.test(guardian.phone);
    if (i === 4) return (cycle?.form_config?.document_uploads ?? []).filter((d) => d.required).every((d) => !!documents[d.key]);
    return true;
  }

  if (!cycle) return <main className="mx-auto max-w-2xl p-8"><p className="text-sm text-gray-600">Loading...</p></main>;

  if (submitted) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <div className="rounded-md border border-green-200 bg-green-50 p-6">
          <h1 className="mb-2 text-xl font-semibold text-green-800">Application Submitted</h1>
          <p className="text-sm text-green-700">Your admission roll number is <strong className="font-mono">{submitted.admission_roll}</strong>.</p>
          <p className="mt-4 text-sm text-gray-600">Save this roll number and your guardian&apos;s phone number — you&apos;ll need both to check your application status.</p>
        </div>

        {submitted.app_fee > 0 && (
          <div className="mt-4 rounded-md border p-6">
            <p className="mb-1 text-sm font-medium">Application fee: ৳{submitted.app_fee}</p>
            <p className="mb-4 text-sm text-gray-600">Pay now to complete your application, or come back to this later using your roll number.</p>
            <div className="flex flex-wrap gap-2">
              {(["BKASH", "NAGAD", "SSLCOMMERZ"] as const).map((gateway) => (
                <button
                  key={gateway}
                  disabled={paying}
                  onClick={() => payNow(gateway)}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  Pay with {gateway === "SSLCOMMERZ" ? "SSLCommerz" : gateway.charAt(0) + gateway.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            {paymentError && <p className="mt-3 text-sm text-red-600">{paymentError}</p>}
          </div>
        )}
      </main>
    );
  }

  if (!cycle.is_open) {
    return <main className="mx-auto max-w-2xl p-8"><p className="text-sm text-gray-600">This admission cycle is not currently open for applications.</p></main>;
  }

  const customFields = (cycle.form_config?.fields ?? []).filter((f) => !f.is_default);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-1 text-2xl font-semibold">{cycle.name}</h1>
      <p className="mb-6 text-sm text-gray-600">{cycle.class.name_en} · ৳{cycle.app_fee} application fee</p>

      <div className="mb-6 flex gap-2 text-xs">
        {STEPS.map((s, i) => (
          <span key={s} className={`rounded-full px-2 py-1 ${i === step ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>{i + 1}. {s}</span>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-3">
          <input required placeholder="Applicant Full Name" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <select value={personalInfo.gender ?? ""} onChange={(e) => setPersonalInfo((p) => ({ ...p, gender: e.target.value }))} className="rounded-md border px-3 py-2 text-sm">
              <option value="">Gender</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
            <input type="date" value={personalInfo.date_of_birth ?? ""} onChange={(e) => setPersonalInfo((p) => ({ ...p, date_of_birth: e.target.value }))} className="rounded-md border px-3 py-2 text-sm" />
          </div>
          <input placeholder="Student Phone (optional, for portal login)" value={personalInfo.phone ?? ""} onChange={(e) => setPersonalInfo((p) => ({ ...p, phone: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" />
          {customFields.map((f) => (
            <input
              key={f.key}
              required={f.required}
              placeholder={f.label_en}
              value={personalInfo[f.key] ?? ""}
              onChange={(e) => setPersonalInfo((p) => ({ ...p, [f.key]: e.target.value }))}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <input placeholder="Father's Name" value={guardian.father_name} onChange={(e) => setGuardian((g) => ({ ...g, father_name: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" />
          <input placeholder="Mother's Name" value={guardian.mother_name} onChange={(e) => setGuardian((g) => ({ ...g, mother_name: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" />
          <input required placeholder="Guardian Phone (01XXXXXXXXX)" value={guardian.phone} onChange={(e) => setGuardian((g) => ({ ...g, phone: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" />
          <input placeholder="Email (optional)" value={guardian.email} onChange={(e) => setGuardian((g) => ({ ...g, email: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" />
          <textarea placeholder="Address" value={guardian.address} onChange={(e) => setGuardian((g) => ({ ...g, address: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <input placeholder="Previous Institution" value={previousResult.institution} onChange={(e) => setPreviousResult((p) => ({ ...p, institution: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" />
          <input placeholder="Class Passed" value={previousResult.class_passed} onChange={(e) => setPreviousResult((p) => ({ ...p, class_passed: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" />
          <div>
            <label className="mb-1 block text-xs text-gray-600">GPA (select the scale it&apos;s out of)</label>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" step="0.01" placeholder="GPA" value={previousResult.gpa} onChange={(e) => setPreviousResult((p) => ({ ...p, gpa: e.target.value }))} className="rounded-md border px-3 py-2 text-sm" />
              <select value={previousResult.gpa_scale} onChange={(e) => setPreviousResult((p) => ({ ...p, gpa_scale: e.target.value }))} className="rounded-md border px-3 py-2 text-sm">
                <option value="5">Out of 5</option>
                <option value="4">Out of 4</option>
                <option value="OTHER">Other scale</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">Total Marks (marks obtained, and out of how much)</label>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" placeholder="Marks Obtained" value={previousResult.marks_obtained} onChange={(e) => setPreviousResult((p) => ({ ...p, marks_obtained: e.target.value }))} className="rounded-md border px-3 py-2 text-sm" />
              <input type="number" placeholder="Out of (e.g. 500)" value={previousResult.marks_total_out_of} onChange={(e) => setPreviousResult((p) => ({ ...p, marks_total_out_of: e.target.value }))} className="rounded-md border px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Compulsory Subjects (auto-assigned)</p>
          <ul className="text-sm text-gray-700">
            {cycle.subjects.compulsory.map((s) => <li key={s.id}>• {s.name_en}</li>)}
          </ul>
          {cycle.subjects.optional.length > 0 && (
            <>
              <p className="mt-4 text-sm text-gray-600">Optional Subjects (choose)</p>
              {cycle.subjects.optional.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedSubjects.includes(s.id)} onChange={(e) => setSelectedSubjects((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))} />
                  {s.name_en}
                </label>
              ))}
            </>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">Accepted: images (JPG/PNG/WebP) or PDF, up to 10MB.</p>
          {(cycle.form_config?.document_uploads ?? []).map((d) => (
            <div key={d.key}>
              <label className="mb-1 block text-sm text-gray-600">{d.label_en}{d.required ? " *" : ""}</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                disabled={uploadingKey === d.key}
                onChange={(e) => handleDocumentSelect(d.key, e.target.files?.[0])}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
              {uploadingKey === d.key && <p className="mt-1 text-xs text-gray-500">Uploading...</p>}
              {uploadErrors[d.key] && <p className="mt-1 text-xs text-red-600">{uploadErrors[d.key]}</p>}
              {documents[d.key] && !uploadErrors[d.key] && (
                <p className="mt-1 text-xs text-green-700">
                  Uploaded — <a href={documents[d.key]} target="_blank" rel="noreferrer" className="underline">view file</a>
                </p>
              )}
            </div>
          ))}
          {!(cycle.form_config?.document_uploads ?? []).length && <p className="text-sm text-gray-600">No documents required for this cycle.</p>}
        </div>
      )}

      {step === 5 && (
        <div className="space-y-2 rounded-md border p-4 text-sm">
          <p><strong>Applicant:</strong> {applicantName}</p>
          <p><strong>Guardian Phone:</strong> {guardian.phone}</p>
          <p><strong>Class:</strong> {cycle.class.name_en}</p>
          <p><strong>Application Fee:</strong> ৳{cycle.app_fee}</p>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex justify-between">
        <button disabled={step === 0} onClick={() => setStep((s) => s - 1)} className="rounded-md border px-4 py-2 text-sm disabled:opacity-50">
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            disabled={!isStepValid(step)}
            onClick={() => setStep((s) => s + 1)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Next
          </button>
        ) : (
          <button
            disabled={submitting || !isStepValid(0) || !isStepValid(1) || !isStepValid(4) || !!uploadingKey}
            onClick={submit}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Application"}
          </button>
        )}
      </div>
    </main>
  );
}
