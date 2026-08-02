"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, Phone, FileText, CheckCircle2, AlertCircle, Calendar, MapPin, Download, CreditCard, Send, Clock } from "lucide-react";

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

interface PaymentInvoice {
  id: string;
  category: string;
  description: string;
  amount_due: number;
  amount_paid: number;
  fine_amount: number;
  status: string;
  pending_verification: boolean;
}

interface PaymentInfo {
  payment_status: "NOT_REQUIRED" | "DUE" | "PARTIAL" | "PENDING_VERIFICATION" | "PAID";
  invoices: PaymentInvoice[];
  gateways: Record<string, boolean>;
  payment_instructions: {
    bkash_number: string | null;
    nagad_number: string | null;
    rocket_number: string | null;
    bank_name: string | null;
    bank_account_name: string | null;
    bank_account_number: string | null;
    bank_routing_number: string | null;
    note: string | null;
  } | null;
}

const MANUAL_GATEWAYS = ["BKASH", "NAGAD", "ROCKET", "BANK_TRANSFER"] as const;

const inputCls = "w-full rounded-2xl border-2 border-slate-100 bg-slate-50 pl-11 pr-4 py-3.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary/40 focus:bg-white focus:outline-none transition-all";
const labelCls = "block text-sm font-semibold text-slate-700 mb-2";

function paymentStatusBadge(status: PaymentInfo["payment_status"]) {
  switch (status) {
    case "PAID":
      return { label: "Paid", cls: "bg-green-100 text-green-700 ring-green-200" };
    case "PARTIAL":
      return { label: "Partially Paid", cls: "bg-amber-100 text-amber-700 ring-amber-200" };
    case "PENDING_VERIFICATION":
      return { label: "Awaiting Verification", cls: "bg-blue-100 text-blue-700 ring-blue-200" };
    default:
      return { label: "Payment Due", cls: "bg-red-100 text-red-700 ring-red-200" };
  }
}

// One invoice's own Pay Now / self-report block — kept as a small nested
// component (not inlined into the list map) since it carries its own local
// form state for the manual self-report fields.
function InvoicePaymentRow({
  invoice,
  admissionRoll,
  phone,
  gateways,
  onReported,
}: {
  invoice: PaymentInvoice;
  admissionRoll: string;
  phone: string;
  gateways: Record<string, boolean>;
  onReported: () => void;
}) {
  const outstanding = Math.max(0, invoice.amount_due + invoice.fine_amount - invoice.amount_paid);
  const settled = invoice.status === "PAID" || invoice.status === "WAIVED";
  const [showManualForm, setShowManualForm] = useState(false);
  const [gateway, setGateway] = useState<(typeof MANUAL_GATEWAYS)[number]>("BKASH");
  const [transactionId, setTransactionId] = useState("");
  const [amount, setAmount] = useState(String(outstanding));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [gatewayLoading, setGatewayLoading] = useState<string | null>(null);

  async function tryGateway(g: string) {
    setGatewayError(null);
    setGatewayLoading(g);
    try {
      const res = await fetch(`${API_URL}/api/admission/application/payment/gateway`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admission_roll: admissionRoll, phone, invoice_id: invoice.id, gateway: g }),
      });
      const body = await res.json();
      if (!res.ok) {
        setGatewayError(body.error?.message ?? "Could not start payment");
        return;
      }
      if (body.data?.configured === false) {
        // Non-functional stub gateway (real credentials pending) -- fall
        // back to the manual self-report flow rather than a dead end.
        setShowManualForm(true);
        return;
      }
      if (body.data?.payment_url) window.location.href = body.data.payment_url;
    } catch {
      setGatewayError("Could not reach the server.");
    } finally {
      setGatewayLoading(null);
    }
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsedAmount = Number(amount);
    if (!transactionId.trim()) { setFormError("Enter the transaction ID."); return; }
    if (!parsedAmount || parsedAmount <= 0) { setFormError("Enter a valid amount."); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/admission/application/payment/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admission_roll: admissionRoll, phone, invoice_id: invoice.id, gateway, transaction_id: transactionId.trim(), amount: parsedAmount }),
      });
      const body = await res.json();
      if (!res.ok) { setFormError(body.error?.message ?? "Could not report payment"); return; }
      setShowManualForm(false);
      onReported();
    } catch {
      setFormError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{invoice.description}</p>
          <p className="text-xs text-slate-400 mt-0.5">{invoice.category}</p>
        </div>
        <span className="shrink-0 font-mono font-bold text-slate-900">৳{outstanding}</span>
      </div>

      {settled ? (
        <p className="mt-3 text-xs font-semibold text-green-700 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Settled</p>
      ) : invoice.pending_verification ? (
        <p className="mt-3 text-xs font-semibold text-blue-700 flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Reported — awaiting staff verification</p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {(["BKASH", "NAGAD", "SSLCOMMERZ", "ROCKET"] as const)
              .filter((g) => gateways[g])
              .map((g) => (
                <button
                  key={g}
                  disabled={gatewayLoading === g}
                  onClick={() => tryGateway(g)}
                  className="rounded-lg border border-green-200 bg-[#f0fdf4] px-3 py-1.5 text-xs font-bold text-green-800 hover:bg-green-100 transition disabled:opacity-50"
                >
                  {g === "SSLCOMMERZ" ? "SSLCommerz" : g.charAt(0) + g.slice(1).toLowerCase()}
                </button>
              ))}
            <button
              onClick={() => setShowManualForm((v) => !v)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
            >
              I&apos;ve already sent money — report it
            </button>
          </div>
          {gatewayError && <p className="text-xs text-red-500">{gatewayError}</p>}

          {showManualForm && (
            <form onSubmit={submitManual} className="mt-2 space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <select value={gateway} onChange={(e) => setGateway(e.target.value as typeof gateway)} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700">
                  {MANUAL_GATEWAYS.map((g) => (
                    <option key={g} value={g}>{g === "BANK_TRANSFER" ? "Bank Transfer" : g.charAt(0) + g.slice(1).toLowerCase()}</option>
                  ))}
                </select>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs" />
              </div>
              <input value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="Transaction ID" className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs" />
              {formError && <p className="text-xs text-red-500">{formError}</p>}
              <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 transition disabled:opacity-50">
                <Send className="h-3.5 w-3.5" /> {submitting ? "Reporting..." : "Report Payment"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function PaymentSection({ admissionRoll, phone }: { admissionRoll: string; phone: string }) {
  const [info, setInfo] = useState<PaymentInfo | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ admission_roll: admissionRoll, phone });
      const res = await fetch(`${API_URL}/api/admission/application/payment-info?${params.toString()}`);
      if (!res.ok) return;
      const body = await res.json();
      setInfo(body.data);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [admissionRoll, phone]);

  if (loading) return null;
  if (!info || info.payment_status === "NOT_REQUIRED") return null;

  const badge = paymentStatusBadge(info.payment_status);
  const instructions = info.payment_instructions;
  const hasInstructions = instructions && (instructions.bkash_number || instructions.nagad_number || instructions.rocket_number || instructions.bank_account_number);

  return (
    <div className="bg-white p-5 space-y-4 border-t border-green-100">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /> Payment</h4>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${badge.cls}`}>{badge.label}</span>
      </div>

      {info.payment_status !== "PAID" && (
        <p className="text-xs font-semibold text-red-600 bg-red-50 rounded-lg px-3 py-2">
          Your application cannot be shortlisted until payment is complete.
        </p>
      )}

      {hasInstructions && info.payment_status !== "PAID" && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-slate-700">Send money manually to:</p>
          {instructions?.bkash_number && <p>bKash (Send Money): {instructions.bkash_number}</p>}
          {instructions?.nagad_number && <p>Nagad (Send Money): {instructions.nagad_number}</p>}
          {instructions?.rocket_number && <p>Rocket (Send Money): {instructions.rocket_number}</p>}
          {instructions?.bank_account_number && (
            <p>Bank: {instructions.bank_name} — {instructions.bank_account_name} — A/C {instructions.bank_account_number}{instructions.bank_routing_number ? ` (Routing: ${instructions.bank_routing_number})` : ""}</p>
          )}
          {instructions?.note && <p className="italic">{instructions.note}</p>}
        </div>
      )}

      <div className="space-y-2">
        {info.invoices.map((inv) => (
          <InvoicePaymentRow key={inv.id} invoice={inv} admissionRoll={admissionRoll} phone={phone} gateways={info.gateways} onReported={load} />
        ))}
      </div>
    </div>
  );
}

export default function AdmissionStatusPage() {
  const t = useTranslations("admissionStatus");
  const searchParams = useSearchParams();
  const [admissionRoll, setAdmissionRoll] = useState(searchParams.get("admission_roll") ?? "");
  const [phone, setPhone] = useState(searchParams.get("phone") ?? "");
  const [result, setResult] = useState<StatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setResult(null);
    // Client-side check before hitting the backend's own /^01\d{9}$/ regex --
    // previously any malformed phone reached the server first and came back
    // as the same opaque "Invalid request body" the apply-wizard bug shared
    // (Plan Twenty-Three, Phase 1).
    if (!/^01\d{9}$/.test(phone)) {
      setError(t("invalidPhone"));
      return;
    }
    setLoading(true);
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

  // Deep-linked from the apply wizard's post-submit confirmation screen
  // (?admission_roll=...&phone=...) -- auto-runs the lookup once so the
  // applicant lands directly on their payment section instead of having to
  // retype what was just submitted moments ago.
  useEffect(() => {
    if (searchParams.get("admission_roll") && searchParams.get("phone")) check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-[calc(100vh-80px)] bg-[#f0fdf4] pt-12 pb-24 px-4 flex justify-center">
      <div className="w-full max-w-lg">

        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-green-100">
            <Search className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">{t("title")}</h1>
          <p className="text-slate-500 text-sm max-w-xs mx-auto">{t("subtitle")}</p>
        </div>

        <div className="bg-white rounded-3xl border border-green-100 shadow-sm p-6 sm:p-8">
          <form onSubmit={check} className="space-y-5">
            <div>
              <label className={labelCls}>Admission Roll Number</label>
              <div className="relative">
                <FileText className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-green-700" />
                <input required placeholder={t("rollPlaceholder")} value={admissionRoll} onChange={(e) => setAdmissionRoll(e.target.value)} className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Guardian Phone</label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-green-700" />
                <input required placeholder={t("phonePlaceholder")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
              </div>
            </div>

            <button type="submit" disabled={loading} className="mt-2 w-full flex items-center justify-center gap-2 rounded-2xl bg-green-700 px-4 py-4 text-sm font-bold text-white hover:bg-green-800 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm shadow-green-200">
              {loading ? (
                <><div className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Checking...</>
              ) : (
                <><Search className="h-5 w-5" /> {t("checkStatus")}</>
              )}
            </button>
          </form>

          {error && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
              <p className="text-sm font-medium text-red-700">{error}</p>
            </div>
          )}

          {result && !result.found && (
            <div className="mt-6 flex flex-col items-center justify-center rounded-2xl bg-slate-50 p-6 text-center border border-slate-100">
              <AlertCircle className="h-8 w-8 text-slate-400 mb-2" />
              <h3 className="font-bold text-slate-700 mb-1">Not Found</h3>
              <p className="text-sm text-slate-500">{t("notFound")}</p>
            </div>
          )}

          {result?.found && (
            <div className="mt-8 rounded-2xl bg-[#f0fdf4] border border-green-100 overflow-hidden">
              <div className="p-5 border-b border-green-100 flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg mb-1">{result.applicant_name}</h3>
                  <p className="text-sm font-medium text-green-700">{result.cycle_name}</p>
                  <p className="text-xs text-slate-500 font-mono mt-1">Roll: {result.admission_roll}</p>
                </div>
                <div className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-primary ring-1 ring-green-200">
                  {t("status", { status: result.status ?? "" })}
                </div>
              </div>

              {result.merit_rank && (
                <div className="bg-white p-4 flex items-center justify-between border-b border-green-100">
                  <span className="text-sm font-semibold text-slate-600">Merit Position</span>
                  <span className="text-lg font-black text-slate-900">#{result.merit_rank}</span>
                </div>
              )}

              {result.admission_roll && (
                <PaymentSection admissionRoll={result.admission_roll} phone={phone} />
              )}

              {result.requires_test && (
                <div className="bg-white p-5 space-y-4 border-t border-green-100">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" /> {t("admissionTest")}
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {result.test_date && (
                      <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <Calendar className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase">Date & Time</p>
                          <p className="text-sm font-semibold text-slate-800 mt-0.5">{t("date", { date: new Date(result.test_date).toLocaleString() })}</p>
                        </div>
                      </div>
                    )}
                    {result.test_venue && (
                      <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase">Venue</p>
                          <p className="text-sm font-semibold text-slate-800 mt-0.5">{t("venue", { venue: result.test_venue })}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    {result.admit_card_available ? (
                      <a
                        href={`${API_URL}/api/admission/application/admit-card?admission_roll=${encodeURIComponent(admissionRoll)}&phone=${encodeURIComponent(phone)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 transition shadow-sm"
                      >
                        <Download className="h-4 w-4" /> {t("downloadAdmitCard")}
                      </a>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-3 text-center">
                        <p className="text-xs font-medium text-slate-500">{t("admitCardPending")}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
