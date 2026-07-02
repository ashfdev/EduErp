import { z } from "zod";

export const deviceSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["FINGERPRINT", "RFID", "GPS"]),
  brand: z.string().optional(),
  serial_number: z.string().optional(),
  location: z.string().optional(),
  ip_address: z.string().optional(),
  port: z.number().int().optional(),
});
export type DeviceInput = z.infer<typeof deviceSchema>;

export const enrollUserSchema = z.object({
  person_id: z.string().min(1),
  person_type: z.enum(["STUDENT", "STAFF"]),
});
