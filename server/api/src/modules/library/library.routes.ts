import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
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

// Registered before "/books/:id" — Express matches route definitions in
// order, and both are single-segment patterns under /books, so "/categories"
// would otherwise be swallowed as an :id lookup (same caution already
// documented elsewhere in this codebase, e.g. hr/staff.routes.ts's /export
// route). Book.category is free-text, not an enum/lookup table, so this is
// the only source of options for a category filter dropdown — deriving them
// from whatever's on the currently-loaded page would give an incomplete,
// shifting list once real pagination is in use.
libraryRouter.get(
  "/books/categories",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.book.findMany({
      where: { is_active: true },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    });
    res.json({ success: true, data: rows.map((r) => r.category).filter(Boolean) });
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
  authorize(LIBRARY_MANAGE_ROLES),
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

    const studentIds = issues.filter((i) => i.person_type === "STUDENT").map((i) => i.person_id);
    const staffIds = issues.filter((i) => i.person_type === "STAFF").map((i) => i.person_id);
    const [students, staff] = await Promise.all([
      prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, name_en: true, student_uid: true } }),
      prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, name_en: true, staff_uid: true } }),
    ]);
    const nameById = new Map<string, { name: string; uid: string }>([
      ...students.map((s) => [s.id, { name: s.name_en, uid: s.student_uid }] as const),
      ...staff.map((s) => [s.id, { name: s.name_en, uid: s.staff_uid }] as const),
    ]);
    const withNames = issues.map((i) => ({ ...i, person_name: nameById.get(i.person_id)?.name ?? null, person_uid: nameById.get(i.person_id)?.uid ?? null }));

    res.json({ success: true, data: withNames });
  }),
);

libraryRouter.get(
  "/issues/export",
  authorize(LIBRARY_MANAGE_ROLES),
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

    const studentIds = issues.filter((i) => i.person_type === "STUDENT").map((i) => i.person_id);
    const staffIds = issues.filter((i) => i.person_type === "STAFF").map((i) => i.person_id);
    const [students, staff] = await Promise.all([
      prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, name_en: true, student_uid: true } }),
      prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, name_en: true, staff_uid: true } }),
    ]);
    const nameById = new Map<string, { name: string; uid: string }>([
      ...students.map((s) => [s.id, { name: s.name_en, uid: s.student_uid }] as const),
      ...staff.map((s) => [s.id, { name: s.name_en, uid: s.staff_uid }] as const),
    ]);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Book Issues");
    sheet.columns = [
      { header: "Book Title", key: "book_title", width: 28 },
      { header: "Person", key: "person_name", width: 22 },
      { header: "ID", key: "person_uid", width: 16 },
      { header: "Type", key: "person_type", width: 10 },
      { header: "Issued At", key: "issued_at", width: 14 },
      { header: "Due Date", key: "due_date", width: 14 },
      { header: "Returned At", key: "returned_at", width: 14 },
      { header: "Status", key: "status", width: 12 },
      { header: "Fine", key: "fine_amount", width: 10 },
    ];
    for (const i of issues) {
      const person = nameById.get(i.person_id);
      sheet.addRow({
        book_title: i.book.title,
        person_name: person?.name ?? "",
        person_uid: person?.uid ?? "",
        person_type: i.person_type,
        issued_at: i.issued_at.toISOString().slice(0, 10),
        due_date: i.due_date.toISOString().slice(0, 10),
        returned_at: i.returned_at ? i.returned_at.toISOString().slice(0, 10) : "",
        status: i.status,
        fine_amount: i.fine_amount ?? 0,
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="Book_Issues.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
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
  authorize(LIBRARY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const issues = await prisma.bookIssue.findMany({ where: { person_id: reqParam(req, "id") }, include: { book: true }, orderBy: { issued_at: "desc" } });
    res.json({ success: true, data: issues });
  }),
);

libraryRouter.get(
  "/reports/overdue",
  authorize(LIBRARY_MANAGE_ROLES),
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
  authorize(LIBRARY_MANAGE_ROLES),
  asyncHandler(async (_req, res) => {
    const issues = await prisma.bookIssue.findMany({ where: { fine_amount: { gt: 0 } } });
    const totalFines = issues.reduce((sum, i) => sum + i.fine_amount, 0);
    const collected = issues.filter((i) => i.fine_paid).reduce((sum, i) => sum + i.fine_amount, 0);
    res.json({ success: true, data: { total_fines: totalFines, collected, outstanding: totalFines - collected, count: issues.length } });
  }),
);
