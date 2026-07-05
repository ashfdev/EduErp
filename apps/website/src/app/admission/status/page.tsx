"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface StatusResult {
  found: boolean;
  admission_roll?: string;
  applicant_name?: string;
  cycle_name?: string;
  status?: string;
  merit_rank?: number | null;
  requires_test?: boolean;
  test_date?: string | null;
  test_venue?: string | null;
  admit_card_available?: boolean;
}

export default function AdmissionStatusPage() {
  const [admissionRoll, setAdmissionRoll] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<StatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({ admission_roll: admissionRoll, phone });
      const res = await fetch(`${API_URL}/api/admission/application/status?${params.toString()}`);
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
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-2 text-2xl font-semibold">Check Application Status</h1>
      <p className="mb-6 text-sm text-gray-600">Enter your admission roll number and the guardian phone number used when applying.</p>

      <form onSubmit={check} className="space-y-3">
        <input required placeholder="Admission Roll Number" value={admissionRoll} onChange={(e) => setAdmissionRoll(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
        <input required placeholder="Guardian Phone (01XXXXXXXXX)" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
        <button type="submit" disabled={loading} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {loading ? "Checking..." : "Check Status"}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {result && !result.found && <p className="mt-4 text-sm text-gray-600">No matching application found.</p>}
      {result?.found && (
        <div className="mt-6 rounded-md border p-4 text-sm">
          <p><strong>{result.applicant_name}</strong> — {result.cycle_name}</p>
          <p className="mt-1 font-mono text-xs text-gray-500">{result.admission_roll}</p>
          <p className="mt-2">Status: <span className="font-medium">{result.status}</span></p>
          {result.merit_rank && <p>Merit Rank: #{result.merit_rank}</p>}

          {result.requires_test && (
            <div className="mt-3 border-t pt-3">
              <p className="font-medium">Admission Test</p>
              {result.test_date && <p>Date: {new Date(result.test_date).toLocaleString()}</p>}
              {result.test_venue && <p>Venue: {result.test_venue}</p>}
              {result.admit_card_available ? (
                <a
                  href={`${API_URL}/api/admission/application/admit-card?admission_roll=${encodeURIComponent(admissionRoll)}&phone=${encodeURIComponent(phone)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Download Admit Card
                </a>
              ) : (
                <p className="mt-1 text-gray-600">Your admit card will be available here once published by the institution.</p>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
