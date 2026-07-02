import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { TRANSPORT_MANAGE_ROLES } from "../../lib/roles";
import { transportRouteSchema, updateStopsSchema, vehicleSchema, assignTransportSchema } from "@education-erp/validators";
import { notFound } from "../../lib/errors";

export const transportRouter = Router();
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
  asyncHandler(async (_req, res) => {
    const vehicles = await prisma.vehicle.findMany({ include: { route: { select: { name: true } } }, orderBy: { vehicle_no: "asc" } });
    res.json({ success: true, data: vehicles });
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
      create: body,
      update: { route_id: body.route_id, pickup_stop: body.pickup_stop },
    });

    if (route.fare > 0) {
      const activeYear = await prisma.academicYear.findFirst({ where: { is_active: true } });
      if (activeYear) {
        await prisma.invoice.create({
          data: {
            student_id: body.student_id,
            academic_year_id: activeYear.id,
            category: "TRANSPORT",
            description: `Transport Fee — ${route.name}`,
            amount_due: route.fare,
            due_date: new Date(),
            status: "PENDING",
          },
        });
      }
    }

    res.status(201).json({ success: true, data: assignment });
  }),
);

transportRouter.get(
  "/routes/:id/students",
  asyncHandler(async (req, res) => {
    const routeId = reqParam(req, "id");
    const students = await prisma.studentTransport.findMany({
      where: { route_id: routeId },
      include: { student: { select: { id: true, name_en: true, student_uid: true, current_class: { select: { name_en: true } } } } },
    });
    res.json({ success: true, data: students });
  }),
);
