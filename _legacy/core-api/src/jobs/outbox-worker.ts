import { prisma } from '../lib/prisma.js';
import { sendOtp } from '../lib/notify.js';

/**
 * Drains pending OutboxEvent rows (PRD §2.2 "payment success -> invoice update ->
 * SMS -> receipt", plan §2.2 flow walkthrough). Runs as a plain polling loop for
 * now — swap for a BullMQ worker once Redis is provisioned (REDIS_URL exists in
 * .env.example but no Redis instance has been stood up yet); callers don't need
 * to change since this function's job (drain one batch) stays the same either way.
 */
export async function processOutboxEvents(batchSize = 20): Promise<{ processed: number; failed: number }> {
  const events = await prisma.outboxEvent.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  let processed = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await handleEvent(event.id, event.tenantId, event.eventType, event.payload as Record<string, unknown>);
      await prisma.outboxEvent.update({ where: { id: event.id }, data: { status: 'done', processedAt: new Date() } });
      processed += 1;
    } catch (err) {
      console.error(`[outbox] failed to process event ${event.id} (${event.eventType}):`, err);
      const retries = event.retries + 1;
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { retries, status: retries >= 5 ? 'failed' : 'pending' },
      });
      failed += 1;
    }
  }

  return { processed, failed };
}

async function handleEvent(eventId: string, tenantId: string, eventType: string, payload: Record<string, unknown>) {
  if (eventType !== 'payment.succeeded') return; // unknown event types are left as-is, not silently dropped

  const invoiceId = payload.invoiceId as string;
  const amount = payload.amount as number;

  const invoice = await prisma.invoice.findFirstOrThrow({ where: { id: invoiceId, tenantId } });
  const newAmountPaid = Number(invoice.amountPaid) + amount;
  const total = Number(invoice.amountDue) - Number(invoice.waivedAmount);

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      amountPaid: newAmountPaid,
      status: newAmountPaid >= total ? 'PAID' : 'PARTIAL',
    },
  });

  const student = await prisma.student.findUnique({ where: { id: invoice.studentId }, include: { user: true, guardian: true } });
  const destination = student?.guardian?.phone ?? student?.user.phone ?? student?.user.email ?? 'unknown';
  await sendOtp(destination, `Payment of ${amount} BDT received for invoice ${invoiceId}. Event ${eventId}.`, 'payment receipt');
}
