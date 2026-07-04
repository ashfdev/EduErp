import { Router } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { initiatePaymentSchema } from "@education-erp/validators";
import { getPaymentAdapter } from "../../services/payment";
import { sendSms } from "../../services/sms.service";
import { createFeeReceiptJournal } from "../accounts/auto-journal.service";
import { badRequest, notFound } from "../../lib/errors";

export const paymentsRouter = Router();

paymentsRouter.post(
  "/initiate",
  authenticate,
  asyncHandler(async (req, res) => {
    const body = initiatePaymentSchema.parse(req.body);
    const invoice = await prisma.invoice.findUnique({ where: { id: body.invoice_id } });
    if (!invoice) throw notFound("Invoice not found");

    const adapter = getPaymentAdapter(body.gateway);
    if (!adapter.isConfigured()) {
      throw badRequest(`${body.gateway} is not configured yet — merchant credentials are pending`);
    }

    const transactionId = randomUUID();
    const result = await adapter.initiatePayment({ invoice_id: invoice.id, amount: invoice.amount_due - invoice.amount_paid, transaction_id: transactionId });

    await prisma.payment.create({
      data: { invoice_id: invoice.id, gateway: body.gateway, transaction_id: transactionId, amount: invoice.amount_due - invoice.amount_paid, status: "INITIATED" },
    });

    res.json({ success: true, data: { payment_url: result.payment_url, session_id: result.session_id } });
  }),
);

async function handleCallback(gateway: "BKASH" | "NAGAD" | "SSLCOMMERZ", payload: unknown) {
  const adapter = getPaymentAdapter(gateway);
  const verified = await adapter.verifyCallback(payload);

  const payment = await prisma.payment.findUnique({ where: { transaction_id: verified.transaction_id } });
  if (!payment) throw notFound("Payment not found for this transaction");

  const status = verified.success ? "COMPLETED" : "FAILED";
  await prisma.payment.update({ where: { id: payment.id }, data: { status, paid_at: verified.success ? new Date() : undefined } });

  if (verified.success) {
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: payment.invoice_id } });
    const newAmountPaid = invoice.amount_paid + payment.amount;
    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { amount_paid: newAmountPaid, status: newAmountPaid >= invoice.amount_due + invoice.fine_amount ? "PAID" : "PARTIAL" },
    });

    await createFeeReceiptJournal(payment, updatedInvoice);

    const student = await prisma.student.findUnique({ where: { id: invoice.student_id } });
    if (student?.father_phone) {
      await sendSms(student.father_phone, `Payment of ৳${payment.amount} received for ${student.name_en}. Thank you.`);
    }
  }

  return { received: true };
}

paymentsRouter.post("/callback/bkash", asyncHandler(async (req, res) => res.json({ success: true, data: await handleCallback("BKASH", req.body) })));
paymentsRouter.post("/callback/nagad", asyncHandler(async (req, res) => res.json({ success: true, data: await handleCallback("NAGAD", req.body) })));
paymentsRouter.post("/callback/sslcommerz", asyncHandler(async (req, res) => res.json({ success: true, data: await handleCallback("SSLCOMMERZ", req.body) })));
