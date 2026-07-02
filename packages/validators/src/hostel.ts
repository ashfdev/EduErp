import { z } from "zod";

export const hostelBlockSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
});

export const hostelRoomSchema = z.object({
  block_id: z.string().min(1),
  room_no: z.string().min(1),
  floor: z.number().int().default(0),
  capacity: z.number().int().min(1).default(4),
  type: z.string().optional(),
});

export const hostelAllocateSchema = z.object({
  room_id: z.string().min(1),
  student_id: z.string().min(1),
  bed_no: z.string().optional(),
  from_date: z.coerce.date(),
});

export const hostelVisitorSchema = z.object({
  student_id: z.string().min(1),
  visitor_name: z.string().min(1),
  relation: z.string().min(1),
  phone: z.string().min(1),
  purpose: z.string().optional(),
});
