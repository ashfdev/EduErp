'use client';

import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface VerifyResult {
  valid: boolean;
  docType?: string;
  issuedAt?: string;
  [key: string]: unknown;
}

export default function VerifyPage() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/api/v1/verify/${encodeURIComponent(code)}`);
    setResult(await res.json());
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Certificate Verification</h1>
      <p className="mb-4 text-sm text-gray-600">
        Scan the QR code on a marksheet or certificate, or enter the verification code printed on it, to confirm it was genuinely issued by this institution.
      </p>
      <form onSubmit={verify} className="flex max-w-md gap-2">
        <input required placeholder="Verification code" value={code} onChange={(e) => setCode(e.target.value)} className="flex-1 rounded-md border px-3 py-2 text-sm" />
        <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Verify
        </button>
      </form>

      {result && (
        <div className={`mt-4 max-w-md rounded-md border p-4 ${result.valid ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
          {result.valid ? (
            <div>
              <p className="font-medium text-green-700">✓ Genuine document</p>
              <ul className="mt-2 text-sm">
                {Object.entries(result)
                  .filter(([k]) => !['valid'].includes(k))
                  .map(([k, v]) => (
                    <li key={k}>
                      <strong>{k}:</strong> {String(v)}
                    </li>
                  ))}
              </ul>
            </div>
          ) : (
            <p className="text-red-700">✗ Not found — this code doesn&apos;t match any issued document.</p>
          )}
        </div>
      )}
    </div>
  );
}
