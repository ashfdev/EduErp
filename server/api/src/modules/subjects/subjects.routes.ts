import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";

// Minimal read-only endpoint pulled forward from Phase 4 because the Phase 3
// student-creation form needs to show compulsory/optional subjects per
// class. Phase 4 adds the full CRUD + teacher assignment on top of this.
export const subjectsRouter = Router();
subjectsRouter.use(authenticate);

subjectsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z.object({ class_id: z.string().optional() }).parse(req.query);
    const subjects = await prisma.subject.findMany({
      where: { is_active: true, ...(query.class_id && { class_id: query.class_id }) },
      orderBy: { display_order: "asc" },
    });
    res.json({ success: true, data: subjects });
  }),
);
