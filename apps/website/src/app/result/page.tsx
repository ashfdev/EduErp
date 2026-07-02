"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface LookupResult {
  found: boolean;
  student_name?: string;
  student_uid?: string;
  results?: {
    exam_name: string;
    subjects: { subject_name: string; marks_total: number | null; grade_letter: string | null; is_absent: boolean }[];
    gpa: number;
    grade: string;
    has_failed: boolean;
  }[];
}

export default function ResultLookupPage() {
  const [mode, setMode] = useState<"uid" | "roll">("uid");
  const [studentUid, setStudentUid] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const params = new URLSearchParams(mode === "uid" ? { student_uid: studentUid } : { roll_no: rollNo, registration_no: registrationNo });

    try {
      const res = await fetch(`${API_URL}/api/results/public/lookup?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error?.message ?? "Lookup failed");
        return;
      }
      setResult(body.data);
    } catch {
      setError("Could not reach the server — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-2xl font-semibold">Result Lookup</h1>
      <p className="mb-6 text-sm text-gray-600">Search for a published exam result using your Student ID, or your Roll and Registration numbers.</p>

      <div className="mb-4 flex gap-4 text-sm">
        <label className="flex items-center gap-1">
          <input type="radio" checked={mode === "uid"} onChange={() => setMode("uid")} /> Student ID
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={mode === "roll"} onChange={() => setMode("roll")} /> Roll + Registration No
        </label>
      </div>

      <form onSubmit={search} className="space-y-3">
        {mode === "uid" ? (
          <input required placeholder="Student ID (e.g. STU-26-0001)" value={studentUid} onChange={(e) => setStudentUid(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
        ) : (
          <>
            <input required placeholder="Roll No" value={rollNo} onChange={(e) => setRollNo(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
            <input required placeholder="Registration No" value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
          </>
        )}
        <button type="submit" disabled={loading} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {loading ? "Searching..." : "Find Result"}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {result && !result.found && <p className="mt-4 text-sm text-gray-600">No matching student found.</p>}

      {result?.found && (
        <div className="mt-6 space-y-4">
          <p className="font-medium">{result.student_name} <span className="font-mono text-sm text-gray-500">({result.student_uid})</span></p>
          {!result.results?.length && <p className="text-sm text-gray-600">No published results available for this student yet.</p>}
          {result.results?.map((r, i) => (
            <div key={i} className="rounded-md border p-4">
              <p className="mb-2 font-medium">{r.exam_name}</p>
              <table className="w-full text-sm">
                <tbody>
                  {r.subjects.map((s, si) => (
                    <tr key={si} className="border-b">
                      <td className="py-1">{s.subject_name}</td>
                      <td className="py-1">{s.is_absent ? "Absent" : s.marks_total}</td>
                      <td className="py-1">{s.grade_letter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-sm">
                Overall: <strong>{r.has_failed ? "Failed" : `GPA ${r.gpa} (${r.grade})`}</strong>
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
