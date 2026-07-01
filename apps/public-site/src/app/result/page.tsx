'use client';

import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? '';

interface ResultData {
  studentUid: string;
  name: string;
  gpa: string;
  letterGrade: string;
  hasFailed: boolean;
  positionInClass: number | null;
}

export default function ResultLookupPage() {
  const [examId, setExamId] = useState('');
  const [studentUid, setStudentUid] = useState('');
  const [result, setResult] = useState<ResultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const res = await fetch(
      `${API_BASE}/api/v1/public/results/lookup?tenantId=${TENANT_ID}&examId=${examId}&studentUid=${studentUid}`,
    );
    if (res.ok) {
      setResult(await res.json());
    } else {
      setError((await res.json().catch(() => ({}))).error ?? 'Result not found');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Result Lookup</h1>
      <form onSubmit={lookup} className="max-w-md space-y-3">
        <input required placeholder="Exam ID" value={examId} onChange={(e) => setExamId(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
        <input required placeholder="Student ID (e.g. ASH-2026-00001)" value={studentUid} onChange={(e) => setStudentUid(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
        <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Check Result
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-4 max-w-md rounded-md border p-4">
          <p><strong>{result.name}</strong> ({result.studentUid})</p>
          <p>GPA: {result.gpa} ({result.hasFailed ? 'F' : result.letterGrade})</p>
          {result.positionInClass && <p>Position in class: {result.positionInClass}</p>}
        </div>
      )}
    </div>
  );
}
