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
  const [submitted, setSubmitted] = useState<{ admission_roll: string; app_fee: number } | null>(null);

  const [applicantName, setApplicantName] = useState("");
  const [personalInfo, setPersonalInfo] = useState<Record<string, string>>({});
  const [guardian, setGuardian] = useState({ father_name: "", mother_name: "", phone: "", email: "", address: "" });
  const [previousResult, setPreviousResult] = useState({ institution: "", class_passed: "", gpa: "", total_marks: "" });
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [documents, setDocuments] = useState<Record<string, string>>({});

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
            ? { institution: previousResult.institution, class_passed: previousResult.class_passed, gpa: previousResult.gpa ? Number(previousResult.gpa) : undefined, total_marks: previousResult.total_marks ? Number(previousResult.total_marks) : undefined }
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

  if (!cycle) return <main className="mx-auto max-w-2xl p-8"><p className="text-sm text-gray-600">Loading...</p></main>;

  if (submitted) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <div className="rounded-md border border-green-200 bg-green-50 p-6">
          <h1 className="mb-2 text-xl font-semibold text-green-800">Application Submitted</h1>
          <p className="text-sm text-green-700">Your admission roll number is <strong className="font-mono">{submitted.admission_roll}</strong>.</p>
          {submitted.app_fee > 0 && <p className="mt-2 text-sm text-green-700">Application fee: ৳{submitted.app_fee} — payment gateways are being configured; you will be contacted for payment instructions.</p>}
          <p className="mt-4 text-sm text-gray-600">Save this roll number and your guardian's phone number — you'll need both to check your application status.</p>
        </div>
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
          <div className="grid grid-cols-2 gap-3">
            <input type="number" step="0.01" placeholder="GPA" value={previousResult.gpa} onChange={(e) => setPreviousResult((p) => ({ ...p, gpa: e.target.value }))} className="rounded-md border px-3 py-2 text-sm" />
            <input type="number" placeholder="Total Marks" value={previousResult.total_marks} onChange={(e) => setPreviousResult((p) => ({ ...p, total_marks: e.target.value }))} className="rounded-md border px-3 py-2 text-sm" />
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
        <div className="space-y-3">
          {(cycle.form_config?.document_uploads ?? []).map((d) => (
            <div key={d.key}>
              <label className="text-sm text-gray-600">{d.label_en}{d.required ? " *" : ""}</label>
              <input placeholder="Document URL" value={documents[d.key] ?? ""} onChange={(e) => setDocuments((prev) => ({ ...prev, [d.key]: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" />
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
            disabled={step === 0 && !applicantName}
            onClick={() => setStep((s) => s + 1)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Next
          </button>
        ) : (
          <button disabled={submitting || !applicantName || !guardian.phone} onClick={submit} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {submitting ? "Submitting..." : "Submit Application"}
          </button>
        )}
      </div>
    </main>
  );
}
