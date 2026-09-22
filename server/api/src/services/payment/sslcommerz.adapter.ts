import axios from "axios";
import type { InitiatePaymentInput, InitiatePaymentResult, PaymentGatewayAdapter } from "./gateway.interface";
import { resolveGatewayCredentials } from "./gateway-config.helper";
import { prisma } from "../../lib/prisma";
import { resolveBaseUrl } from "../../lib/env";

function sessionApiUrl(sandbox: boolean): string {
  return sandbox ? "https://sandbox.sslcommerz.com/gwprocess/v4/api.php" : "https://securepay.sslcommerz.com/gwprocess/v4/api.php";
}

function validationApiUrl(sandbox: boolean): string {
  return sandbox
    ? "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php"
    : "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php";
}

function credentialSource() {
  return {
    app_key: process.env.SSLCOMMERZ_STORE_ID,
    app_secret: process.env.SSLCOMMERZ_STORE_PASSWORD,
    sandbox_mode: process.env.SSLCOMMERZ_SANDBOX !== "false",
  };
}

// SSLCommerz's session-init API requires customer name/phone/email/address
// fields that InitiatePaymentInput doesn't carry — resolved here from the
// invoice's student or (pre-enrollment) admission application instead of
// widening the shared adapter interface for one gateway's requirement.
async function resolveCustomer(invoiceId: string): Promise<{ name: string; phone: string; email: string }> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { student: true, application: true } });

  if (invoice?.student) {
    return {
      name: invoice.student.name_en,
      phone: invoice.student.phone || invoice.student.father_phone || "01700000000",
      email: `${invoice.student.student_uid.toLowerCase()}@eduerp.invoice`,
    };
  }
  if (invoice?.application) {
    const guardianInfo = invoice.application.guardian_info as { phone?: string; email?: string } | null;
    return {
      name: invoice.application.applicant_name,
      phone: guardianInfo?.phone ?? "01700000000",
      email: guardianInfo?.email ?? "guardian@eduerp.invoice",
    };
  }
  return { name: "Guardian", phone: "01700000000", email: "guardian@eduerp.invoice" };
}

export const sslcommerzAdapter: PaymentGatewayAdapter = {
  name: "SSLCOMMERZ",
  isConfigured: async () => (await resolveGatewayCredentials("SSLCOMMERZ", credentialSource())).configured,

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const creds = await resolveGatewayCredentials("SSLCOMMERZ", credentialSource());
    if (!creds.configured || !creds.app_key || !creds.app_secret) {
      return { status: "FAILED" };
    }

    const apiBase = resolveBaseUrl("API_URL", process.env.API_URL, `http://localhost:${process.env.PORT ?? 4000}`);
    const customer = await resolveCustomer(input.invoice_id);

    const params = new URLSearchParams({
      store_id: creds.app_key,
      store_passwd: creds.app_secret,
      total_amount: input.amount.toFixed(2),
      currency: "BDT",
      tran_id: input.transaction_id,
      success_url: `${apiBase}/api/fees/gateway-redirect/sslcommerz/success`,
      fail_url: `${apiBase}/api/fees/gateway-redirect/sslcommerz/fail`,
      cancel_url: `${apiBase}/api/fees/gateway-redirect/sslcommerz/cancel`,
      ipn_url: `${apiBase}/api/fees/callback/sslcommerz`,
      cus_name: customer.name,
      cus_email: customer.email,
      cus_add1: "Dhaka",
      cus_city: "Dhaka",
      cus_postcode: "1000",
      cus_country: "Bangladesh",
      cus_phone: customer.phone,
      shipping_method: "NO",
      product_name: "School Fee Payment",
      product_category: "Education",
      product_profile: "general",
    });

    let data: Record<string, unknown>;
    try {
      const res = await axios.post(sessionApiUrl(creds.sandbox_mode), params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 15000,
      });
      data = res.data as Record<string, unknown>;
    } catch {
      return { status: "FAILED" };
    }

    if (data.status !== "SUCCESS" || !data.GatewayPageURL) {
      return { status: "FAILED" };
    }
    return { payment_url: String(data.GatewayPageURL), session_id: data.sessionkey ? String(data.sessionkey) : undefined, status: "INITIATED" };
  },

  async verifyCallback(payload: unknown): Promise<{ transaction_id: string; success: boolean }> {
    const body = (payload ?? {}) as Record<string, unknown>;
    const tran_id = typeof body.tran_id === "string" ? body.tran_id : "";
    const val_id = typeof body.val_id === "string" ? body.val_id : "";
    if (!tran_id || !val_id) return { transaction_id: tran_id, success: false };

    const creds = await resolveGatewayCredentials("SSLCOMMERZ", credentialSource());
    if (!creds.configured || !creds.app_key || !creds.app_secret) return { transaction_id: tran_id, success: false };

    // Never trust the IPN/redirect body's own status field — a POST to
    // these public, unauthenticated endpoints could claim anything. val_id
    // is the one thing a forged request can't fabricate a valid answer for:
    // confirm it server-to-server against SSLCommerz's own Order Validation
    // API before treating this transaction as real.
    let validation: Record<string, unknown>;
    try {
      const res = await axios.get(validationApiUrl(creds.sandbox_mode), {
        params: { val_id, store_id: creds.app_key, store_passwd: creds.app_secret, format: "json" },
        timeout: 15000,
      });
      validation = res.data as Record<string, unknown>;
    } catch {
      return { transaction_id: tran_id, success: false };
    }

    const status = String(validation.status ?? "").toUpperCase();
    const validatedTranId = String(validation.tran_id ?? "");
    if ((status !== "VALID" && status !== "VALIDATED") || validatedTranId !== tran_id) {
      return { transaction_id: tran_id, success: false };
    }

    // val_id alone proves "a real, completed SSLCommerz transaction exists,"
    // not that it was for the RIGHT amount — cross-check against what this
    // Payment row was actually created for. The +0.5 tolerance only absorbs
    // paisa-level float noise; it never accepts materially less than owed.
    const payment = await prisma.payment.findUnique({ where: { transaction_id: tran_id } });
    const validatedAmount = Number(validation.amount ?? validation.currency_amount ?? 0);
    if (!payment || validatedAmount + 0.5 < payment.amount) {
      return { transaction_id: tran_id, success: false };
    }

    return { transaction_id: tran_id, success: true };
  },
};
