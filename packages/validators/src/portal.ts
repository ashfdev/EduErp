import { z } from "zod";

export const pushSubscribeSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().min(1),
});

export const portalPaySchema = z.object({
  invoice_id: z.string().min(1),
  gateway: z.enum(["BKASH", "NAGAD", "SSLCOMMERZ"]),
});
