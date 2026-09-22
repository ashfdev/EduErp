import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { prisma } from "../../lib/prisma";
import { sslcommerzAdapter } from "./sslcommerz.adapter";

vi.mock("axios");
vi.mock("../../lib/prisma", () => ({
  prisma: {
    invoice: { findUnique: vi.fn() },
    payment: { findUnique: vi.fn() },
    paymentGatewayConfig: { findUnique: vi.fn() },
  },
}));

const mockedAxios = vi.mocked(axios, true);
const mockedInvoiceFind = vi.mocked(prisma.invoice.findUnique);
const mockedPaymentFind = vi.mocked(prisma.payment.findUnique);
const mockedGatewayConfigFind = vi.mocked(prisma.paymentGatewayConfig.findUnique);

describe("sslcommerzAdapter", () => {
  beforeEach(() => {
    process.env.SSLCOMMERZ_STORE_ID = "test_store";
    process.env.SSLCOMMERZ_STORE_PASSWORD = "test_pass";
    process.env.SSLCOMMERZ_SANDBOX = "true";
    process.env.API_URL = "https://erpapi.example.com";
    // No active DB-stored config row -- every test exercises the env-var
    // fallback path, matching how this adapter actually runs today (Settings
    // -> Payment Gateways UI exists but no row has been activated yet).
    mockedGatewayConfigFind.mockResolvedValue(null as never);
  });

  afterEach(() => {
    vi.resetAllMocks();
    delete process.env.SSLCOMMERZ_STORE_ID;
    delete process.env.SSLCOMMERZ_STORE_PASSWORD;
    delete process.env.SSLCOMMERZ_SANDBOX;
    delete process.env.API_URL;
  });

  describe("isConfigured", () => {
    it("is true once store_id/store_passwd env vars are set", async () => {
      expect(await sslcommerzAdapter.isConfigured()).toBe(true);
    });

    it("is false when credentials are missing", async () => {
      delete process.env.SSLCOMMERZ_STORE_ID;
      expect(await sslcommerzAdapter.isConfigured()).toBe(false);
    });
  });

  describe("initiatePayment", () => {
    it("posts to the sandbox session API and returns the GatewayPageURL on success", async () => {
      mockedInvoiceFind.mockResolvedValue({
        student: { name_en: "Rakib Hasan", phone: "01711111111", father_phone: null, student_uid: "ALh-26-0001" },
        application: null,
      } as never);
      mockedAxios.post.mockResolvedValue({ data: { status: "SUCCESS", GatewayPageURL: "https://sandbox.sslcommerz.com/pay/abc123", sessionkey: "abc123" } });

      const result = await sslcommerzAdapter.initiatePayment({ invoice_id: "inv_1", amount: 1500, transaction_id: "TXN_1" });

      expect(result).toEqual({ payment_url: "https://sandbox.sslcommerz.com/pay/abc123", session_id: "abc123", status: "INITIATED" });
      const [url, body] = mockedAxios.post.mock.calls[0]!;
      expect(url).toBe("https://sandbox.sslcommerz.com/gwprocess/v4/api.php");
      const params = new URLSearchParams(body as string);
      expect(params.get("store_id")).toBe("test_store");
      expect(params.get("store_passwd")).toBe("test_pass");
      expect(params.get("total_amount")).toBe("1500.00");
      expect(params.get("tran_id")).toBe("TXN_1");
      expect(params.get("success_url")).toBe("https://erpapi.example.com/api/fees/gateway-redirect/sslcommerz/success");
      expect(params.get("ipn_url")).toBe("https://erpapi.example.com/api/fees/callback/sslcommerz");
      expect(params.get("cus_name")).toBe("Rakib Hasan");
      expect(params.get("cus_phone")).toBe("01711111111");
    });

    it("uses the live session API when sandbox mode is off", async () => {
      process.env.SSLCOMMERZ_SANDBOX = "false";
      mockedInvoiceFind.mockResolvedValue({ student: null, application: null } as never);
      mockedAxios.post.mockResolvedValue({ data: { status: "SUCCESS", GatewayPageURL: "https://securepay.sslcommerz.com/pay/xyz" } });

      await sslcommerzAdapter.initiatePayment({ invoice_id: "inv_1", amount: 500, transaction_id: "TXN_2" });

      expect(mockedAxios.post.mock.calls[0]![0]).toBe("https://securepay.sslcommerz.com/gwprocess/v4/api.php");
    });

    it("returns FAILED when the gateway rejects session creation", async () => {
      mockedInvoiceFind.mockResolvedValue({ student: null, application: null } as never);
      mockedAxios.post.mockResolvedValue({ data: { status: "FAILED", failedreason: "Invalid store credentials" } });

      const result = await sslcommerzAdapter.initiatePayment({ invoice_id: "inv_1", amount: 500, transaction_id: "TXN_3" });
      expect(result).toEqual({ status: "FAILED" });
    });

    it("returns FAILED (never throws) on a network error", async () => {
      mockedInvoiceFind.mockResolvedValue({ student: null, application: null } as never);
      mockedAxios.post.mockRejectedValue(new Error("timeout"));

      const result = await sslcommerzAdapter.initiatePayment({ invoice_id: "inv_1", amount: 500, transaction_id: "TXN_4" });
      expect(result).toEqual({ status: "FAILED" });
    });

    it("returns FAILED without calling the gateway when not configured", async () => {
      delete process.env.SSLCOMMERZ_STORE_ID;
      const result = await sslcommerzAdapter.initiatePayment({ invoice_id: "inv_1", amount: 500, transaction_id: "TXN_5" });
      expect(result).toEqual({ status: "FAILED" });
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe("verifyCallback", () => {
    it("confirms success only after the Order Validation API confirms VALID + matching tran_id + sufficient amount", async () => {
      mockedAxios.get.mockResolvedValue({ data: { status: "VALID", tran_id: "TXN_9", amount: "1500.00" } });
      mockedPaymentFind.mockResolvedValue({ id: "pay_1", transaction_id: "TXN_9", amount: 1500 } as never);

      const result = await sslcommerzAdapter.verifyCallback({ tran_id: "TXN_9", val_id: "val_abc" });

      expect(result).toEqual({ transaction_id: "TXN_9", success: true });
      const [url, options] = mockedAxios.get.mock.calls[0]!;
      expect(url).toBe("https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php");
      expect((options as { params: Record<string, string> }).params).toMatchObject({ val_id: "val_abc", store_id: "test_store", store_passwd: "test_pass" });
    });

    it("rejects a forged callback whose val_id the validation API reports as invalid", async () => {
      mockedAxios.get.mockResolvedValue({ data: { status: "FAILED" } });

      const result = await sslcommerzAdapter.verifyCallback({ tran_id: "TXN_10", val_id: "bogus" });
      expect(result).toEqual({ transaction_id: "TXN_10", success: false });
    });

    it("rejects when the validated amount is less than what this Payment was created for", async () => {
      mockedAxios.get.mockResolvedValue({ data: { status: "VALID", tran_id: "TXN_11", amount: "100.00" } });
      mockedPaymentFind.mockResolvedValue({ id: "pay_2", transaction_id: "TXN_11", amount: 1500 } as never);

      const result = await sslcommerzAdapter.verifyCallback({ tran_id: "TXN_11", val_id: "val_low" });
      expect(result).toEqual({ transaction_id: "TXN_11", success: false });
    });

    it("rejects when val_id or tran_id is missing from the payload", async () => {
      expect(await sslcommerzAdapter.verifyCallback({})).toEqual({ transaction_id: "", success: false });
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });
});
