import { z } from "zod";

export const transportRouteSchema = z.object({
  name: z.string().min(1),
  fare: z.number().min(0).default(0),
  // Opt-in seat cap (Plan Twenty-Five, Phase F) — null/undefined means
  // unlimited, matching this codebase's established "opt-in constraint"
  // convention (e.g. Program.max_credit_hours_per_semester).
  seat_capacity: z.number().int().min(1).optional().nullable(),
});

export const routeStopSchema = z.object({
  name: z.string().min(1),
  stop_order: z.number().int().min(0),
  time: z.string().optional(),
});

export const updateStopsSchema = z.object({
  stops: z.array(routeStopSchema),
});

export const vehicleSchema = z.object({
  route_id: z.string().optional().nullable(),
  vehicle_no: z.string().min(1),
  type: z.string().min(1),
  capacity: z.number().int().min(1),
  driver_name: z.string().optional(),
  driver_phone: z.string().optional(),
  insurance_exp: z.coerce.date().optional().nullable(),
});

export const assignTransportSchema = z.object({
  student_id: z.string().min(1),
  route_id: z.string().min(1),
  pickup_stop: z.string().optional(),
  // Opt-in (Plan Twenty-Five, Phase F): when supplied, the student is
  // linked to this recurring TRANSPORT FeeStructure instead of the old
  // flat one-off invoice — matching what request-approval already does,
  // so a directly-assigned student recurs correctly too. Omitted =
  // unchanged legacy flat-invoice behavior.
  fee_structure_id: z.string().optional().nullable(),
});

// Student/guardian-submitted self-service request to be assigned a route
// (Plan Twenty-Five, Phase F) — mirrors createWaiverRequestSchema's own
// "just the essentials, admin decides the rest on review" shape.
export const createTransportRequestSchema = z.object({
  route_id: z.string().min(1),
  pickup_stop: z.string().optional(),
  reason: z.string().optional(),
});

// Approving IS assigning the route + attaching a recurring fee — the admin
// must pick which TRANSPORT-category Fee Structure applies going forward.
export const approveTransportRequestSchema = z.object({
  fee_structure_id: z.string().min(1).optional().nullable(),
});

export const rejectTransportRequestSchema = z.object({
  rejection_reason: z.string().min(1),
});

// Phase 37 — live transport tracking.
export const locationPingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed: z.number().min(0).optional(),
  source: z.string().min(1).optional(),
});
