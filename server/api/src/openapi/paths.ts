import { z } from "zod";
import {
  loginSchema,
  createStudentSchema,
  markAttendanceSchema,
  createExamSchema,
  submitMarksSchema,
  generateInvoiceSchema,
} from "@education-erp/validators";
import { registry, ErrorResponseSchema, successResponse } from "./registry";

// Representative core coverage, not exhaustive — this proves the pattern end
// to end (every schema below is the EXACT same Zod schema the route already
// validates against, not a re-description of it) so the remaining ~60 route
// files can be registered incrementally by copying one of these blocks.
// See docs/openapi.md for the extension pattern.

const bearer = [{ bearerAuth: [] }];
const errorResponses = {
  400: { description: "Validation error", content: { "application/json": { schema: ErrorResponseSchema } } },
  401: { description: "Missing/invalid/expired token", content: { "application/json": { schema: ErrorResponseSchema } } },
  403: { description: "Authenticated but not permitted", content: { "application/json": { schema: ErrorResponseSchema } } },
  404: { description: "Not found", content: { "application/json": { schema: ErrorResponseSchema } } },
};

registry.registerPath({
  method: "post",
  path: "/api/auth/login",
  tags: ["Auth"],
  summary: "Log in and receive an access + refresh token pair",
  request: { body: { content: { "application/json": { schema: loginSchema } } } },
  responses: {
    200: {
      description: "Login succeeded",
      content: {
        "application/json": {
          schema: successResponse(z.object({ access_token: z.string(), refresh_token: z.string(), user: z.object({ id: z.string(), role: z.string(), name_en: z.string() }) })),
        },
      },
    },
    401: errorResponses[401],
    429: { description: "Too many failed attempts — banned for 1 hour", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/students",
  tags: ["Students"],
  summary: "List students (paginated, filterable by class/section/status/search)",
  security: bearer,
  request: {
    query: z.object({
      search: z.string().optional(), class_id: z.string().optional(), section_id: z.string().optional(),
      status: z.string().optional(), gender: z.string().optional(),
      page: z.coerce.number().default(1), limit: z.coerce.number().default(20),
    }),
  },
  responses: {
    200: { description: "Paginated student list", content: { "application/json": { schema: successResponse(z.array(z.record(z.unknown())), { paginated: true }) } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/students",
  tags: ["Students"],
  summary: "Create a student",
  security: bearer,
  request: { body: { content: { "application/json": { schema: createStudentSchema } } } } as never,
  responses: { 201: { description: "Created", content: { "application/json": { schema: successResponse(z.record(z.unknown())) } } }, ...errorResponses },
});

registry.registerPath({
  method: "post",
  path: "/api/attendance/mark",
  tags: ["Attendance"],
  summary: "Mark attendance for a section (own section only for CLASS_TEACHER/SUBJECT_TEACHER)",
  security: bearer,
  request: { body: { content: { "application/json": { schema: markAttendanceSchema } } } },
  responses: { 200: { description: "Saved", content: { "application/json": { schema: successResponse(z.record(z.unknown())) } } }, ...errorResponses },
});

registry.registerPath({
  method: "post",
  path: "/api/exams",
  tags: ["Examination"],
  summary: "Create an exam",
  security: bearer,
  request: { body: { content: { "application/json": { schema: createExamSchema } } } },
  responses: { 201: { description: "Created", content: { "application/json": { schema: successResponse(z.record(z.unknown())) } } }, ...errorResponses },
});

registry.registerPath({
  method: "post",
  path: "/api/marks/submit",
  tags: ["Examination"],
  summary: "Submit marks for a subject (SUBJECT_TEACHER, own subject only)",
  security: bearer,
  request: { body: { content: { "application/json": { schema: submitMarksSchema } } } },
  responses: { 200: { description: "Saved", content: { "application/json": { schema: successResponse(z.record(z.unknown())) } } }, ...errorResponses },
});

registry.registerPath({
  method: "get",
  path: "/api/results/public/lookup",
  tags: ["Results"],
  summary: "Public result lookup by student ID, or roll + registration number — no auth required",
  request: {
    query: z.object({
      student_uid: z.string().optional(), roll_no: z.string().optional(), registration_no: z.string().optional(), exam_id: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "Result(s) found", content: { "application/json": { schema: successResponse(z.record(z.unknown())) } } },
    400: errorResponses[400],
    404: errorResponses[404],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/fees/invoices/generate",
  tags: ["Fees"],
  summary: "Generate a single invoice for a student",
  security: bearer,
  request: { body: { content: { "application/json": { schema: generateInvoiceSchema } } } },
  responses: { 201: { description: "Created", content: { "application/json": { schema: successResponse(z.record(z.unknown())) } } }, ...errorResponses },
});
