"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { API_URL, fetchContent } from "@/lib/content-api";
import type { Institution } from "@/lib/types";
import { MapPin, Phone, Mail, Send, MessageSquare } from "lucide-react";

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
  
  // Use student_login_bg_url safely
  const bgImage = (institution as any)?.student_login_bg_url ?? `${portalUrl}/assets/login-illustration.png`;

  const inputCls = "w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary/40 focus:bg-white focus:outline-none transition-all";
  const labelCls = "block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2";

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50 relative flex flex-col overflow-hidden z-0">
      
      {/* Blurred Background Image matching green theme styling */}
      <div 
        className="absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat opacity-[0.15] blur-[80px] scale-125 pointer-events-none mix-blend-multiply filter sepia-[0.3] hue-rotate-90 saturate-200"
        style={{ backgroundImage: `url('${bgImage}')` }}
      ></div>

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-10 lg:py-16 relative z-10">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-start">
          {/* Contact Info (Left) */}
          <div className="lg:col-span-4 flex flex-col lg:sticky lg:top-32 pt-4">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-6 ring-4 ring-primary/5">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-4">{t("title")}</h1>
            <p className="text-slate-500 mb-10 text-base leading-relaxed">
              We'd love to hear from you. Please fill out the form or use the contact information below.
            </p>

            <div className="space-y-6">
              <div className="flex items-start gap-4 p-4 rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 transition-all hover:shadow-md hover:ring-primary/20">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-50 text-primary">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Address</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">{institution?.address || "Address not available"}</p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 transition-all hover:shadow-md hover:ring-primary/20">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-50 text-primary">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Phone</h3>
                  <p className="text-slate-600 text-sm">{institution?.phone_primary ? t("phone", { phone: institution.phone_primary }) : "Phone not available"}</p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 transition-all hover:shadow-md hover:ring-primary/20">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-50 text-primary">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Email</h3>
                  <p className="text-slate-600 text-sm">{institution?.email_primary ? t("email", { email: institution.email_primary }) : "Email not available"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Contact Form + Map */}
          <div className="lg:col-span-7 lg:col-start-6 flex flex-col gap-8">
            {/* Form */}
            <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-100">
              {submitted ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="h-20 w-20 bg-[#f0fdf4] text-primary rounded-full flex items-center justify-center mb-6 ring-8 ring-green-50">
                    <Send className="h-8 w-8 ml-1" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-3">Message Sent Successfully!</h2>
                  <p className="text-slate-500">{t("thankYou")}</p>
                </div>
              ) : (
                <form onSubmit={submit} className="flex flex-col gap-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className={labelCls}>Name</label>
                      <input required placeholder={t("namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Email</label>
                      <input type="email" placeholder={t("emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className={labelCls}>Phone</label>
                      <input placeholder={t("phonePlaceholder")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Subject</label>
                      <input placeholder={t("subjectPlaceholder")} value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Message</label>
                    <textarea required rows={5} placeholder={t("messagePlaceholder")} value={message} onChange={(e) => setMessage(e.target.value)} className={`${inputCls} resize-none`} />
                  </div>

                  {error && (
                    <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 font-medium border border-red-100 flex items-start gap-3">
                      <div className="shrink-0 mt-0.5">⚠️</div>
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={loading} className="mt-2 flex w-full sm:w-auto sm:self-start items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-3.5 text-sm font-bold text-white transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 shadow-sm shadow-green-200">
                    {loading ? (
                      <><div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> {t("sending")}</>
                    ) : (
                      <>{t("sendMessage")} <Send className="h-4 w-4 ml-1" /></>
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Map (Right side under form) */}
            <div className="h-[350px] w-full rounded-3xl overflow-hidden shadow-sm ring-1 ring-slate-100 bg-slate-100 relative group">
              <iframe
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                allowFullScreen
                src={googleMapUrl}
                className="w-full h-full grayscale-[15%] transition-all duration-700 group-hover:grayscale-0"
              ></iframe>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
