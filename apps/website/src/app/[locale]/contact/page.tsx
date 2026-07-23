"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { API_URL, fetchContent } from "@/lib/content-api";
import type { Institution } from "@/lib/types";
import { MapPin, Phone, Mail, Send } from "lucide-react";

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

  const mapQuery = institution?.address ? encodeURIComponent(institution.address) : "Chattogram, Bangladesh";
  const googleMapUrl = `https://www.google.com/maps/embed/v1/place?key=AIzaSyC-vh-mYwgSjPd3tn08IeQbckKWeM5NohY&q=${mapQuery}`;
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001";
  const bgImage = institution?.student_login_bg_url ?? `${portalUrl}/assets/login-illustration.png`;

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50 relative flex flex-col overflow-hidden z-0">
      
      {/* Blurred Portal Login Illustration */}
      <div 
        className="absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat opacity-60 blur-[60px] scale-125 pointer-events-none"
        style={{ backgroundImage: `url('${bgImage}')` }}
      ></div>

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 lg:py-16 relative z-10">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-start">
          {/* Contact Info (Left) */}
          <div className="lg:col-span-4 flex flex-col lg:sticky lg:top-32 pt-4">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-4">{t("title")}</h1>
            <p className="text-slate-500 mb-8 text-base leading-relaxed">
              We'd love to hear from you. Please fill out the form or use the contact information below.
            </p>

            <div className="space-y-6">
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/60 backdrop-blur-md shadow-sm ring-1 ring-slate-200/50 text-slate-600">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-0.5">Address</h3>
                  <p className="text-slate-600 text-sm leading-relaxed max-w-xs">{institution?.address || "Address not available"}</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/60 backdrop-blur-md shadow-sm ring-1 ring-slate-200/50 text-slate-600">
                  <Phone className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-0.5">Phone</h3>
                  <p className="text-slate-600 text-sm">{institution?.phone_primary ? t("phone", { phone: institution.phone_primary }) : "Phone not available"}</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/60 backdrop-blur-md shadow-sm ring-1 ring-slate-200/50 text-slate-600">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-0.5">Email</h3>
                  <p className="text-slate-600 text-sm">{institution?.email_primary ? t("email", { email: institution.email_primary }) : "Email not available"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Contact Form + Map */}
          <div className="lg:col-span-7 lg:col-start-6 flex flex-col gap-12">
            {/* Form */}
            <div className="bg-white/70 backdrop-blur-xl rounded-3xl p-6 sm:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-white">
              {submitted ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="h-14 w-14 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                    <Send className="h-6 w-6" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mb-2">Message Sent</h2>
                  <p className="text-slate-600 text-sm">{t("thankYou")}</p>
                </div>
              ) : (
                <form onSubmit={submit} className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Name</label>
                      <input required placeholder={t("namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-slate-200/60 bg-white/50 backdrop-blur-sm px-3.5 py-2.5 text-sm text-slate-900 transition-colors focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Email</label>
                      <input type="email" placeholder={t("emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-200/60 bg-white/50 backdrop-blur-sm px-3.5 py-2.5 text-sm text-slate-900 transition-colors focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Phone</label>
                      <input placeholder={t("phonePlaceholder")} value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-slate-200/60 bg-white/50 backdrop-blur-sm px-3.5 py-2.5 text-sm text-slate-900 transition-colors focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Subject</label>
                      <input placeholder={t("subjectPlaceholder")} value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-xl border border-slate-200/60 bg-white/50 backdrop-blur-sm px-3.5 py-2.5 text-sm text-slate-900 transition-colors focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Message</label>
                    <textarea required rows={5} placeholder={t("messagePlaceholder")} value={message} onChange={(e) => setMessage(e.target.value)} className="w-full rounded-xl border border-slate-200/60 bg-white/50 backdrop-blur-sm px-3.5 py-2.5 text-sm text-slate-900 transition-colors focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 resize-none" />
                  </div>

                  {error && (
                    <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 font-medium">
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={loading} className="mt-2 flex w-full sm:w-auto sm:self-start items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white transition-all hover:bg-slate-800 disabled:opacity-50 shadow-md">
                    {loading ? t("sending") : t("sendMessage")}
                    {!loading && <Send className="h-4 w-4" />}
                  </button>
                </form>
              )}
            </div>

            {/* Map (Right side under form) */}
            <div className="h-[450px] w-full rounded-3xl overflow-hidden shadow-sm ring-1 ring-slate-200/50 bg-slate-100 group">
              <iframe
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                allowFullScreen
                src={googleMapUrl}
                className="w-full h-full grayscale-[15%] contrast-125 transition-all duration-700 group-hover:grayscale-0"
              ></iframe>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
