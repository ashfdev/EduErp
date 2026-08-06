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
  // Opt-in (Plan Twenty-Five, Phase F): when supplied, the student is
  // linked to this recurring HOSTEL FeeStructure — matching what request-
  // approval does. Omitted = unchanged legacy behavior (zero financial
  // record, exactly as before this existed).
  fee_structure_id: z.string().optional().nullable(),
});

export const hostelVisitorSchema = z.object({
  student_id: z.string().min(1),
  visitor_name: z.string().min(1),
  relation: z.string().min(1),
  phone: z.string().min(1),
  purpose: z.string().optional(),
});

// Student/guardian-submitted self-service request to be allocated a hostel
// room (Plan Twenty-Five, Phase F) — same shape as its Transport sibling.
export const createHostelRequestSchema = z.object({
  room_id: z.string().min(1),
  reason: z.string().optional(),
});

export const approveHostelRequestSchema = z.object({
  fee_structure_id: z.string().min(1).optional().nullable(),
});

export const rejectHostelRequestSchema = z.object({
  rejection_reason: z.string().min(1),
});
