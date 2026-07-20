"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { API_URL, fetchContent } from "@/lib/content-api";
import type { Institution } from "@/lib/types";

export default function ContactPage() {
  const t = useTranslations("contact");
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Secondary (sidebar address/phone/email) — the contact form itself
    // doesn't depend on this, so a failure just leaves the sidebar blank
    // rather than blocking the page.
    fetchContent<Institution>("/institution").then(setInstitution).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/content/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: email || undefined, phone: phone || undefined, subject: subject || undefined, message }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error?.message ?? t("submitFailed"));
        return;
      }
      setSubmitted(true);
    } catch {
      setError(t("networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-4 text-2xl font-semibold">{t("title")}</h1>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <p className="text-sm text-gray-600">{institution?.address}</p>
          <p className="mt-1 text-sm text-gray-600">{t("phone", { phone: institution?.phone_primary ?? "" })}</p>
          <p className="text-sm text-gray-600">{t("email", { email: institution?.email_primary ?? "" })}</p>
          {institution?.map_embed_code && <div className="mt-4" dangerouslySetInnerHTML={{ __html: institution.map_embed_code }} />}
        </div>

        <div>
          {submitted ? (
            <p className="rounded-md bg-green-50 p-4 text-sm text-green-700">{t("thankYou")}</p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <input required placeholder={t("namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
              <input type="email" placeholder={t("emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
              <input placeholder={t("phonePlaceholder")} value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
              <input placeholder={t("subjectPlaceholder")} value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
              <textarea required rows={5} placeholder={t("messagePlaceholder")} value={message} onChange={(e) => setMessage(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={loading} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--primary)" }}>
                {loading ? t("sending") : t("sendMessage")}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
