import { Router } from "express";
import ExcelJS from "exceljs";
import { randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { deviceKeyAuth } from "../../middleware/device-key-auth";
import { vehiclePingLimiter } from "../../middleware/rate-limit";
import { reqParam } from "../../lib/req-param";
import { TRANSPORT_MANAGE_ROLES } from "../../lib/roles";
import { transportRouteSchema, updateStopsSchema, vehicleSchema, assignTransportSchema, locationPingSchema, approveTransportRequestSchema, rejectTransportRequestSchema } from "@education-erp/validators";
import { generateInvoiceNo } from "../fees/fee-number.generator";
import { applyWaiversToInvoice, attachFeeStructureToStudent } from "../fees/invoice-helpers";
import { notFound } from "../../lib/errors";
import { logAudit } from "../../lib/audit-log";
import { createInAppNotification } from "../../services/in-app-notification.service";

export const transportRouter = Router();

// Device-authenticated ingestion — must be registered before the blanket
// authenticate() below, since a GPS tracker has no staff JWT at all.
transportRouter.post(
  "/vehicles/ping",
  vehiclePingLimiter,
  deviceKeyAuth,
  asyncHandler(async (req, res) => {
    const body = locationPingSchema.parse(req.body);
    const ping = await prisma.vehicleLocationPing.create({
      data: { vehicle_id: req.vehicle!.id, ...body },
    });
    res.status(201).json({ success: true, data: ping });
  }),
);

transportRouter.use(authenticate);

transportRouter.post(
  "/routes",
  authorize(TRANSPORT_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = transportRouteSchema.parse(req.body);
    const route = await prisma.transportRoute.create({ data: body });
    res.status(201).json({ success: true, data: route });
  }),
);

transportRouter.get(
  "/routes",
  authorize(TRANSPORT_MANAGE_ROLES),
  asyncHandler(async (_req, res) => {
    const routes = await prisma.transportRoute.findMany({
      include: { stops: { orderBy: { stop_order: "asc" } }, _count: { select: { vehicles: true, students: true } } },
      orderBy: { name: "asc" },
    });
    res.json({ success: true, data: routes });
  }),
);

transportRouter.put(
  "/routes/:id",
  authorize(TRANSPORT_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = transportRouteSchema.partial().parse(req.body);
    const route = await prisma.transportRoute.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: route });
  }),
);

transportRouter.post(
  "/routes/:id/stops",
  authorize(TRANSPORT_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const routeId = reqParam(req, "id");
    const body = updateStopsSchema.parse(req.body);
    const route = await prisma.transportRoute.findUnique({ where: { id: routeId } });
    if (!route) throw notFound("Route not found");

    await prisma.$transaction([
      prisma.routeStop.deleteMany({ where: { route_id: routeId } }),
      prisma.routeStop.createMany({ data: body.stops.map((s) => ({ ...s, route_id: routeId })) }),
    ]);

    const stops = await prisma.routeStop.findMany({ where: { route_id: routeId }, orderBy: { stop_order: "asc" } });
    res.json({ success: true, data: stops });
  }),
);

transportRouter.post(
  "/vehicles",
  authorize(TRANSPORT_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = vehicleSchema.parse(req.body);
    const vehicle = await prisma.vehicle.create({ data: body });
    res.status(201).json({ success: true, data: vehicle });
  }),
);

transportRouter.put(
  "/vehicles/:id",
  authorize(TRANSPORT_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = vehicleSchema.partial().parse(req.body);
    const vehicle = await prisma.vehicle.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: vehicle });
  }),
);

transportRouter.get(
  "/vehicles",
  authorize(TRANSPORT_MANAGE_ROLES),
  asyncHandler(async (_req, res) => {
    // device_api_key is fetched only to derive a boolean and is stripped
    // before the response — the raw key itself is a live secret regardless
    // of role (see /vehicles/:id/device-key for the one-time, gated reveal).
    const vehicles = await prisma.vehicle.findMany({
      select: {
        id: true, route_id: true, vehicle_no: true, type: true, capacity: true,
        driver_name: true, driver_phone: true, insurance_exp: true, is_active: true, created_at: true,
        device_api_key: true,
        route: { select: { name: true } },
      },
      orderBy: { vehicle_no: "asc" },
    });
    res.json({
      success: true,
      data: vehicles.map(({ device_api_key, ...v }) => ({ ...v, has_device_key: !!device_api_key })),
    });
  }),
);

transportRouter.get(
  "/vehicles/export",
  authorize(TRANSPORT_MANAGE_ROLES),
  asyncHandler(async (_req, res) => {
    const vehicles = await prisma.vehicle.findMany({
      select: {
        vehicle_no: true, type: true, capacity: true,
        driver_name: true, driver_phone: true, insurance_exp: true, is_active: true,
        route: { select: { name: true } },
      },
      orderBy: { vehicle_no: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Vehicles");
    sheet.columns = [
      { header: "Vehicle No", key: "vehicle_no", width: 16 },
      { header: "Type", key: "type", width: 12 },
      { header: "Capacity", key: "capacity", width: 10 },
      { header: "Route", key: "route", width: 18 },
      { header: "Driver", key: "driver_name", width: 20 },
      { header: "Driver Phone", key: "driver_phone", width: 16 },
      { header: "Insurance Expires", key: "insurance_exp", width: 16 },
      { header: "Active", key: "is_active", width: 10 },
    ];
    for (const v of vehicles) {
      sheet.addRow({
        vehicle_no: v.vehicle_no,
        type: v.type,
        capacity: v.capacity,
        route: v.route?.name ?? "",
        driver_name: v.driver_name ?? "",
        driver_phone: v.driver_phone ?? "",
        insurance_exp: v.insurance_exp ? v.insurance_exp.toISOString().slice(0, 10) : "",
        is_active: v.is_active ? "Yes" : "No",
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="Vehicles.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  }),
);

// Phase 37 — issue/rotate a vehicle's GPS-ping device key. Returned exactly
// once here; the stored value is never included in any other response.
transportRouter.post(
  "/vehicles/:id/device-key",
  authorize(TRANSPORT_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.vehicle.findUnique({ where: { id } });
    if (!existing) throw notFound("Vehicle not found");
    const device_api_key = randomBytes(24).toString("hex");
    await prisma.vehicle.update({ where: { id }, data: { device_api_key } });
    res.json({ success: true, data: { device_api_key } });
  }),
);

transportRouter.delete(
  "/vehicles/:id/device-key",
  authorize(TRANSPORT_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.vehicle.update({ where: { id: reqParam(req, "id") }, data: { device_api_key: null } });
    res.status(204).send();
  }),
);

transportRouter.get(
  "/vehicles/:id/locations/latest",
  authorize(TRANSPORT_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const vehicleId = reqParam(req, "id");
    const latest = await prisma.vehicleLocationPing.findFirst({
      where: { vehicle_id: vehicleId },
      orderBy: { recorded_at: "desc" },
    });
    res.json({ success: true, data: latest });
  }),
);

transportRouter.get(
  "/vehicles/:id/locations",
  authorize(TRANSPORT_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const vehicleId = reqParam(req, "id");
    const pings = await prisma.vehicleLocationPing.findMany({
      where: { vehicle_id: vehicleId },
      orderBy: { recorded_at: "desc" },
      take: 100,
    });
    res.json({ success: true, data: pings });
  }),
);

transportRouter.post(
  "/assign",
  authorize(TRANSPORT_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = assignTransportSchema.parse(req.body);
    const route = await prisma.transportRoute.findUnique({ where: { id: body.route_id } });
    if (!route) throw notFound("Route not found");
    const student = await prisma.student.findFirst({ where: { id: body.student_id, deleted_at: null } });
    if (!student) throw notFound("Student not found");

    const assignment = await prisma.studentTransport.upsert({
      where: { student_id: body.student_id },
      create: { student_id: body.student_id, route_id: body.route_id, pickup_stop: body.pickup_stop },
      update: { route_id: body.route_id, pickup_stop: body.pickup_stop },
    });

    if (body.fee_structure_id) {
      // Opt-in recurring fee (Plan Twenty-Five, Phase F) -- same mechanism
      // request-approval uses, so a directly-assigned student ends up in
      // the same correctly-recurring state, not the old flat one-off.
      await attachFeeStructureToStudent(prisma, body.fee_structure_id, body.student_id, req.user!.sub);
    } else if (route.fare > 0) {
      const activeYear = await prisma.academicYear.findFirst({ where: { is_active: true } });
      if (activeYear) {
        const invoice = await prisma.invoice.create({
          data: {
            invoice_no: await generateInvoiceNo(prisma),
            student_id: body.student_id,
            academic_year_id: activeYear.id,
            category: "TRANSPORT",
            description: `Transport Fee — ${route.name}`,
            amount_due: route.fare,
            due_date: new Date(),
            status: "PENDING",
          },
        });
        // Waiver auto-apply (Plan Twenty-One follow-up) -- same reasoning
        // as every other invoice-creation path: a waiver whose
        // applicable_categories includes TRANSPORT (or is empty = all
        // categories) must actually reduce this invoice.
        await applyWaiversToInvoice(prisma, invoice);
      }
    }

    res.status(201).json({ success: true, data: assignment });
  }),
);

// ── Facility request review (Plan Twenty-Five, Phase F) ─────────────────
transportRouter.get(
  "/requests",
  authorize(TRANSPORT_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "PENDING";
    const requests = await prisma.transportRequest.findMany({
      where: { status: status as "PENDING" | "APPROVED" | "REJECTED" },
      include: {
        student: { select: { id: true, name_en: true, student_uid: true, current_class: { select: { name_en: true } }, current_section: { select: { name: true } } } },
        route: { select: { name: true, fare: true } },
      },
      orderBy: { created_at: "asc" },
    });
    res.json({ success: true, data: requests });
  }),
);

transportRouter.put(
  "/requests/:id/approve",
  authorize(TRANSPORT_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = approveTransportRequestSchema.parse(req.body);
    const request = await prisma.transportRequest.findFirst({ where: { id, status: "PENDING" } });
    if (!request) throw notFound("Request not found or already reviewed");

    const updated = await prisma.$transaction(async (tx) => {
      await tx.studentTransport.upsert({
        where: { student_id: request.student_id },
        create: { student_id: request.student_id, route_id: request.route_id, pickup_stop: request.pickup_stop },
        update: { route_id: request.route_id, pickup_stop: request.pickup_stop },
      });
      if (body.fee_structure_id) {
        await attachFeeStructureToStudent(tx, body.fee_structure_id, request.student_id, req.user!.sub);
      }
      return tx.transportRequest.update({
        where: { id },
        data: { status: "APPROVED", reviewed_by_id: req.user!.sub, reviewed_at: new Date(), fee_structure_id: body.fee_structure_id ?? null },
      });
    });

    await logAudit("FACILITY_REQUEST_REVIEWED", { userId: req.user!.sub, targetType: "TransportRequest", targetId: id, metadata: { decision: "APPROVED", fee_structure_id: body.fee_structure_id }, req });
    await createInAppNotification({
      userId: request.requested_by_user_id,
      type: "TRANSPORT_REQUEST_APPROVED",
      title: "Transport request approved",
      body: "Your transport request has been approved.",
      link: "/facilities/transport",
    });
    res.json({ success: true, data: updated });
  }),
);

transportRouter.put(
  "/requests/:id/reject",
  authorize(TRANSPORT_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = rejectTransportRequestSchema.parse(req.body);
    const request = await prisma.transportRequest.findFirst({ where: { id, status: "PENDING" } });
    if (!request) throw notFound("Request not found or already reviewed");

    const updated = await prisma.transportRequest.update({
      where: { id },
      data: { status: "REJECTED", reviewed_by_id: req.user!.sub, reviewed_at: new Date(), rejection_reason: body.rejection_reason },
    });
    await logAudit("FACILITY_REQUEST_REVIEWED", { userId: req.user!.sub, targetType: "TransportRequest", targetId: id, metadata: { decision: "REJECTED" }, req });
    await createInAppNotification({
      userId: request.requested_by_user_id,
      type: "TRANSPORT_REQUEST_REJECTED",
      title: "Transport request rejected",
      body: body.rejection_reason,
      link: "/facilities/transport",
    });
    res.json({ success: true, data: updated });
  }),
);

transportRouter.get(
  "/routes/:id/students",
  authorize(TRANSPORT_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const routeId = reqParam(req, "id");
    const students = await prisma.studentTransport.findMany({
      where: { route_id: routeId },
      include: { student: { select: { id: true, name_en: true, student_uid: true, current_class: { select: { name_en: true } } } } },
    });
    res.json({ success: true, data: students });
  }),
);
