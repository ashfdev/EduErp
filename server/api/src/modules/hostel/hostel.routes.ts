import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { HOSTEL_MANAGE_ROLES } from "../../lib/roles";
import { hostelBlockSchema, hostelRoomSchema, hostelAllocateSchema, hostelVisitorSchema } from "@education-erp/validators";
import { badRequest, notFound } from "../../lib/errors";

export const hostelRouter = Router();
hostelRouter.use(authenticate);

hostelRouter.get(
  "/blocks",
  authorize(HOSTEL_MANAGE_ROLES),
  asyncHandler(async (_req, res) => {
    const blocks = await prisma.hostelBlock.findMany({ include: { rooms: { include: { _count: { select: { allocations: true } } } } }, orderBy: { name: "asc" } });
    res.json({ success: true, data: blocks });
  }),
);

hostelRouter.post(
  "/blocks",
  authorize(HOSTEL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = hostelBlockSchema.parse(req.body);
    const block = await prisma.hostelBlock.create({ data: body });
    res.status(201).json({ success: true, data: block });
  }),
);

hostelRouter.post(
  "/rooms",
  authorize(HOSTEL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = hostelRoomSchema.parse(req.body);
    const room = await prisma.hostelRoom.create({ data: body });
    res.status(201).json({ success: true, data: room });
  }),
);

hostelRouter.put(
  "/rooms/:id",
  authorize(HOSTEL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = hostelRoomSchema.partial().parse(req.body);
    const room = await prisma.hostelRoom.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: room });
  }),
);

hostelRouter.get(
  "/rooms",
  authorize(HOSTEL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const availableOnly = req.query.available === "true";
    const rooms = await prisma.hostelRoom.findMany({
      where: { is_active: true },
      include: { block: true, allocations: { where: { is_active: true } } },
      orderBy: [{ block_id: "asc" }, { room_no: "asc" }],
    });
    const withBeds = rooms.map((r) => ({ ...r, occupied: r.allocations.length, beds_free: r.capacity - r.allocations.length }));
    const filtered = availableOnly ? withBeds.filter((r) => r.beds_free > 0) : withBeds;
    res.json({ success: true, data: filtered });
  }),
);

hostelRouter.get(
  "/rooms/:id/residents",
  authorize(HOSTEL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const roomId = reqParam(req, "id");
    const allocations = await prisma.hostelAllocation.findMany({
      where: { room_id: roomId, is_active: true },
      include: { student: { select: { id: true, name_en: true, student_uid: true, current_class: { select: { name_en: true } } } } },
    });
    res.json({ success: true, data: allocations });
  }),
);

hostelRouter.post(
  "/allocate",
  authorize(HOSTEL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = hostelAllocateSchema.parse(req.body);
    const room = await prisma.hostelRoom.findUnique({ where: { id: body.room_id }, include: { allocations: { where: { is_active: true } } } });
    if (!room) throw notFound("Room not found");
    if (room.allocations.length >= room.capacity) throw badRequest("This room is at full capacity");

    const existing = await prisma.hostelAllocation.findFirst({ where: { student_id: body.student_id, is_active: true } });
    if (existing) throw badRequest("This student already has an active hostel allocation");

    const allocation = await prisma.hostelAllocation.create({ data: body });
    res.status(201).json({ success: true, data: allocation });
  }),
);

hostelRouter.post(
  "/allocations/:id/checkout",
  authorize(HOSTEL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const allocation = await prisma.hostelAllocation.update({ where: { id }, data: { is_active: false, to_date: new Date() } });
    res.json({ success: true, data: allocation });
  }),
);

hostelRouter.post(
  "/visitors",
  authorize(HOSTEL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = hostelVisitorSchema.parse(req.body);
    const visitor = await prisma.hostelVisitor.create({ data: { ...body, approved_by: req.user!.sub } });
    res.status(201).json({ success: true, data: visitor });
  }),
);

hostelRouter.get(
  "/visitors",
  authorize(HOSTEL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const activeOnly = req.query.active === "true";
    const visitors = await prisma.hostelVisitor.findMany({
      where: activeOnly ? { out_time: null } : undefined,
      orderBy: { in_time: "desc" },
    });
    res.json({ success: true, data: visitors });
  }),
);

hostelRouter.put(
  "/visitors/:id/checkout",
  authorize(HOSTEL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const visitor = await prisma.hostelVisitor.findUnique({ where: { id } });
    if (!visitor) throw notFound("Visitor record not found");
    if (visitor.out_time) throw badRequest("This visitor has already checked out");

    const updated = await prisma.hostelVisitor.update({ where: { id }, data: { out_time: new Date() } });
    res.json({ success: true, data: updated });
  }),
);

hostelRouter.get(
  "/reports/occupancy",
  authorize(HOSTEL_MANAGE_ROLES),
  asyncHandler(async (_req, res) => {
    const rooms = await prisma.hostelRoom.findMany({ where: { is_active: true }, include: { block: true, allocations: { where: { is_active: true } } } });
    const totalCapacity = rooms.reduce((sum, r) => sum + r.capacity, 0);
    const totalOccupied = rooms.reduce((sum, r) => sum + r.allocations.length, 0);

    res.json({
      success: true,
      data: {
        total_capacity: totalCapacity,
        total_occupied: totalOccupied,
        fill_rate: totalCapacity ? Math.round((totalOccupied / totalCapacity) * 1000) / 10 : 0,
        rooms: rooms.map((r) => ({
          id: r.id,
          block_name: r.block.name,
          room_no: r.room_no,
          capacity: r.capacity,
          occupied: r.allocations.length,
          fill_rate: r.capacity ? Math.round((r.allocations.length / r.capacity) * 1000) / 10 : 0,
        })),
      },
    });
  }),
);
