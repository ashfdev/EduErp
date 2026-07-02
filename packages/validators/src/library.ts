import { z } from "zod";

export const bookSchema = z.object({
  isbn: z.string().optional(),
  title: z.string().min(1),
  author: z.string().min(1),
  publisher: z.string().optional(),
  edition: z.string().optional(),
  category: z.string().min(1),
  subject_id: z.string().optional(),
  total_copies: z.number().int().min(1).default(1),
  location: z.string().optional(),
  barcode: z.string().optional(),
});
export type BookInput = z.infer<typeof bookSchema>;

export const addCopiesSchema = z.object({
  count: z.number().int().min(1),
});

export const issueBookSchema = z.object({
  book_id: z.string().min(1),
  person_id: z.string().min(1),
  person_type: z.enum(["STUDENT", "STAFF"]),
  due_date: z.coerce.date(),
  fine_per_day: z.number().min(0).default(2),
});

export const returnBookSchema = z.object({
  fine_paid: z.boolean().default(false),
});
