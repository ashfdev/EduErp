"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("admissionStatus");
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
        setError(body.error?.message ?? t("lookupFailed"));
        return;
      }
      setResult(body.data);
    } catch {
      setError(t("networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-2 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 text-sm text-gray-600">{t("subtitle")}</p>

      <form onSubmit={check} className="space-y-3">
        <input required placeholder={t("rollPlaceholder")} value={admissionRoll} onChange={(e) => setAdmissionRoll(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
        <input required placeholder={t("phonePlaceholder")} value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
        <button type="submit" disabled={loading} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {loading ? t("checking") : t("checkStatus")}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {result && !result.found && <p className="mt-4 text-sm text-gray-600">{t("notFound")}</p>}
      {result?.found && (
        <div className="mt-6 rounded-md border p-4 text-sm">
          <p><strong>{result.applicant_name}</strong> — {result.cycle_name}</p>
          <p className="mt-1 font-mono text-xs text-gray-500">{result.admission_roll}</p>
          <p className="mt-2">{t("status", { status: result.status ?? "" })}</p>
          {result.merit_rank && <p>{t("meritRank", { rank: result.merit_rank })}</p>}

          {result.requires_test && (
            <div className="mt-3 border-t pt-3">
              <p className="font-medium">{t("admissionTest")}</p>
              {result.test_date && <p>{t("date", { date: new Date(result.test_date).toLocaleString() })}</p>}
              {result.test_venue && <p>{t("venue", { venue: result.test_venue })}</p>}
              {result.admit_card_available ? (
                <a
                  href={`${API_URL}/api/admission/application/admit-card?admission_roll=${encodeURIComponent(admissionRoll)}&phone=${encodeURIComponent(phone)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  {t("downloadAdmitCard")}
                </a>
              ) : (
                <p className="mt-1 text-gray-600">{t("admitCardPending")}</p>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
