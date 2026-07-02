import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { LIBRARY_MANAGE_ROLES } from "../../lib/roles";
import { bookSchema, addCopiesSchema, issueBookSchema, returnBookSchema } from "@education-erp/validators";
import { sendSms } from "../../services/sms.service";
import { badRequest, notFound } from "../../lib/errors";

export const libraryRouter = Router();
libraryRouter.use(authenticate);

function daysLate(dueDate: Date, returnedAt: Date): number {
  const diff = Math.floor((returnedAt.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

async function personName(personId: string, personType: "STUDENT" | "STAFF") {
  if (personType === "STUDENT") {
    const s = await prisma.student.findUnique({ where: { id: personId }, select: { name_en: true, student_uid: true, father_phone: true } });
    return s ? { name: s.name_en, uid: s.student_uid, phone: s.father_phone } : null;
  }
  const st = await prisma.staff.findUnique({ where: { id: personId }, select: { name_en: true, staff_uid: true, phone: true } });
  return st ? { name: st.name_en, uid: st.staff_uid, phone: st.phone } : null;
}

libraryRouter.get(
  "/books",
  asyncHandler(async (req, res) => {
    const query = z
      .object({ search: z.string().optional(), category: z.string().optional(), available_only: z.string().optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) })
      .parse(req.query);

    const where = {
      is_active: true,
      ...(query.category && { category: query.category }),
      ...(query.available_only === "true" && { available: { gt: 0 } }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: "insensitive" as const } },
          { author: { contains: query.search, mode: "insensitive" as const } },
          { isbn: { contains: query.search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.book.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: { title: "asc" } }),
      prisma.book.count({ where }),
    ]);
    res.json({ success: true, data: items, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
  }),
);

libraryRouter.get(
  "/books/:id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const book = await prisma.book.findUnique({ where: { id } });
    if (!book) throw notFound("Book not found");
    const activeIssues = await prisma.bookIssue.count({ where: { book_id: id, status: "ISSUED" } });
    res.json({ success: true, data: { ...book, active_issues: activeIssues } });
  }),
);

libraryRouter.post(
  "/books",
  authorize(LIBRARY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = bookSchema.parse(req.body);
    const book = await prisma.book.create({ data: { ...body, available: body.total_copies } });
    res.status(201).json({ success: true, data: book });
  }),
);

libraryRouter.put(
  "/books/:id",
  authorize(LIBRARY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = bookSchema.partial().parse(req.body);
    const book = await prisma.book.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: book });
  }),
);

libraryRouter.post(
  "/books/:id/copies",
  authorize(LIBRARY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = addCopiesSchema.parse(req.body);
    const book = await prisma.book.update({ where: { id }, data: { total_copies: { increment: body.count }, available: { increment: body.count } } });
    res.json({ success: true, data: book });
  }),
);

libraryRouter.get(
  "/issues",
  asyncHandler(async (req, res) => {
    const query = z.object({ status: z.string().optional(), person_type: z.string().optional(), overdue: z.string().optional() }).parse(req.query);
    const issues = await prisma.bookIssue.findMany({
      where: {
        ...(query.status && { status: query.status as never }),
        ...(query.person_type && { person_type: query.person_type as never }),
        ...(query.overdue === "true" && { status: "ISSUED", due_date: { lt: new Date() } }),
      },
      include: { book: true },
      orderBy: { issued_at: "desc" },
    });
    res.json({ success: true, data: issues });
  }),
);

libraryRouter.post(
  "/issues/issue",
  authorize(LIBRARY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = issueBookSchema.parse(req.body);
    const book = await prisma.book.findUnique({ where: { id: body.book_id } });
    if (!book) throw notFound("Book not found");
    if (book.available < 1) throw badRequest("No copies of this book are currently available");

    const person = await personName(body.person_id, body.person_type);
    if (!person) throw notFound(`${body.person_type === "STUDENT" ? "Student" : "Staff"} not found`);

    const issue = await prisma.$transaction(async (tx) => {
      await tx.book.update({ where: { id: body.book_id }, data: { available: { decrement: 1 } } });
      return tx.bookIssue.create({
        data: {
          book_id: body.book_id,
          person_id: body.person_id,
          person_type: body.person_type,
          due_date: body.due_date,
          fine_per_day: body.fine_per_day,
          issued_by_id: req.user!.sub,
        },
      });
    });

    if (person.phone) await sendSms(person.phone, `"${book.title}" issued to ${person.name}. Due date: ${body.due_date.toLocaleDateString()}.`);

    res.status(201).json({ success: true, data: issue });
  }),
);

libraryRouter.post(
  "/issues/:id/return",
  authorize(LIBRARY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = returnBookSchema.parse(req.body);
    const issue = await prisma.bookIssue.findUnique({ where: { id }, include: { book: true } });
    if (!issue) throw notFound("Issue record not found");
    if (issue.status === "RETURNED") throw badRequest("This book has already been returned");

    const returnedAt = new Date();
    const late = daysLate(issue.due_date, returnedAt);
    const fineAmount = late * issue.fine_per_day;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.bookIssue.update({
        where: { id },
        data: { returned_at: returnedAt, status: "RETURNED", fine_amount: fineAmount, fine_paid: body.fine_paid, returned_to_id: req.user!.sub },
      });
      await tx.book.update({ where: { id: issue.book_id }, data: { available: { increment: 1 } } });
      return result;
    });

    res.json({ success: true, data: updated });
  }),
);

libraryRouter.get(
  "/issues/person/:id",
  asyncHandler(async (req, res) => {
    const issues = await prisma.bookIssue.findMany({ where: { person_id: reqParam(req, "id") }, include: { book: true }, orderBy: { issued_at: "desc" } });
    res.json({ success: true, data: issues });
  }),
);

libraryRouter.get(
  "/reports/overdue",
  asyncHandler(async (_req, res) => {
    const overdue = await prisma.bookIssue.findMany({ where: { status: "ISSUED", due_date: { lt: new Date() } }, include: { book: true }, orderBy: { due_date: "asc" } });
    const withPerson = await Promise.all(
      overdue.map(async (i) => ({
        ...i,
        person: await personName(i.person_id, i.person_type),
        days_late: daysLate(i.due_date, new Date()),
        projected_fine: daysLate(i.due_date, new Date()) * i.fine_per_day,
      })),
    );
    res.json({ success: true, data: withPerson });
  }),
);

libraryRouter.get(
  "/reports/fine-report",
  asyncHandler(async (_req, res) => {
    const issues = await prisma.bookIssue.findMany({ where: { fine_amount: { gt: 0 } } });
    const totalFines = issues.reduce((sum, i) => sum + i.fine_amount, 0);
    const collected = issues.filter((i) => i.fine_paid).reduce((sum, i) => sum + i.fine_amount, 0);
    res.json({ success: true, data: { total_fines: totalFines, collected, outstanding: totalFines - collected, count: issues.length } });
  }),
);
