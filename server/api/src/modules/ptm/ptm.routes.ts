import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { resolveOwnStaffId } from "../../lib/own-staff";
import { PTM_MANAGE_ROLES, COMPLAINT_MANAGE_ROLES } from "../../lib/roles";
import { ptmSlotSchema } from "@education-erp/validators";
import { conflict, forbidden, notFound } from "../../lib/errors";

// Staff-side: a teacher manages their own slots (PTM_MANAGE_ROLES already
// includes CLASS_TEACHER/SUBJECT_TEACHER). Admin oversight of ALL bookings
// across every teacher can't live in portalRouter (that whole router is
// gated to PORTAL_ROLES only) so it lives here instead.
export const ptmRouter = Router();
ptmRouter.use(authenticate, authorize(PTM_MANAGE_ROLES));

ptmRouter.get(
  "/slots",
  asyncHandler(async (req, res) => {
    const ownStaffId = await resolveOwnStaffId(req.user!.sub);
    const slots = await prisma.pTMSlot.findMany({
      where: { teacher_id: ownStaffId },
      include: { booking: { include: { student: { select: { name_en: true } }, guardian: { select: { name_en: true, phone: true } } } }, class: { select: { name_en: true } } },
      orderBy: { date: "asc" },
    });
    res.json({ success: true, data: slots });
  }),
);

ptmRouter.post(
  "/slots",
  asyncHandler(async (req, res) => {
    const ownStaffId = await resolveOwnStaffId(req.user!.sub);
    const body = ptmSlotSchema.parse(req.body);
    const slot = await prisma.pTMSlot.create({ data: { ...body, teacher_id: ownStaffId } });
    res.status(201).json({ success: true, data: slot });
  }),
);

ptmRouter.delete(
  "/slots/:id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const ownStaffId = await resolveOwnStaffId(req.user!.sub);
    const slot = await prisma.pTMSlot.findUnique({ where: { id } });
    if (!slot) throw notFound("Slot not found");
    if (slot.teacher_id !== ownStaffId) throw forbidden("You can only manage your own slots");
    if (slot.is_booked) throw conflict("This slot is already booked and cannot be deleted");
    await prisma.pTMSlot.delete({ where: { id } });
    res.status(204).send();
  }),
);

// Admin-only oversight across every teacher's bookings.
ptmRouter.get(
  "/bookings",
  authorize(COMPLAINT_MANAGE_ROLES),
  asyncHandler(async (_req, res) => {
    const bookings = await prisma.pTMBooking.findMany({
      where: { status: "CONFIRMED" },
      include: {
        slot: { include: { teacher: { select: { name_en: true } } } },
        student: { select: { name_en: true, student_uid: true } },
        guardian: { select: { name_en: true, phone: true } },
      },
      orderBy: { booked_at: "desc" },
    });
    res.json({ success: true, data: bookings });
  }),
);
