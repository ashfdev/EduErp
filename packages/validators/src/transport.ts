import { z } from "zod";

export const transportRouteSchema = z.object({
  name: z.string().min(1),
  fare: z.number().min(0).default(0),
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
});

// Phase 37 — live transport tracking.
export const locationPingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed: z.number().min(0).optional(),
  source: z.string().min(1).optional(),
});
