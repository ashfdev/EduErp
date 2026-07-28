import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { EXAM_MANAGE_ROLES } from "../../lib/roles";
import { examHallSchema } from "@education-erp/validators";
import { notFound } from "../../lib/errors";

// A reusable exam-hall/room catalog (name, room number, floor, a rows x
// seats-per-row grid) -- admin-managed once, reused across every future
// exam's seat-plan generation, instead of retyping an ad-hoc hall name +
// capacity every single time.
export const examHallsRouter = Router();
examHallsRouter.use(authenticate, authorize(EXAM_MANAGE_ROLES));

examHallsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const halls = await prisma.examHall.findMany({ where: { is_active: true }, orderBy: { name: "asc" } });
    res.json({ success: true, data: halls });
  }),
);

examHallsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = examHallSchema.parse(req.body);
    const hall = await prisma.examHall.create({
      data: {
        name: body.name,
        room_number: body.room_number,
        floor: body.floor,
        rows: body.rows,
        seats_per_row: body.seats_per_row,
        capacity: body.capacity ?? body.rows * body.seats_per_row,
      },
    });
    res.status(201).json({ success: true, data: hall });
  }),
);

examHallsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.examHall.findUnique({ where: { id } });
    if (!existing) throw notFound("Hall not found");
    const body = examHallSchema.parse(req.body);
    const hall = await prisma.examHall.update({
      where: { id },
      data: {
        name: body.name,
        room_number: body.room_number,
        floor: body.floor,
        rows: body.rows,
        seats_per_row: body.seats_per_row,
        capacity: body.capacity ?? body.rows * body.seats_per_row,
      },
    });
    res.json({ success: true, data: hall });
  }),
);

// Soft-deactivate only -- a hall already referenced by a real ExamSeatPlan
// row (via hall_id) must never disappear out from under historical seat
// assignments, matching this codebase's own established "no hard delete of
// a historically-referenced catalog row" convention.
examHallsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.examHall.findUnique({ where: { id } });
    if (!existing) throw notFound("Hall not found");
    const inUse = await prisma.examSeatPlan.findFirst({ where: { hall_id: id } });
    if (inUse) {
      await prisma.examHall.update({ where: { id }, data: { is_active: false } });
      res.json({ success: true, data: { deactivated: true } });
      return;
    }
    await prisma.examHall.delete({ where: { id } });
    res.status(204).send();
  }),
);
