import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@education-erp/db";
import { ApiError } from "../lib/errors";

// Maps Prisma's opaque error codes onto the project's REST error-code
// convention so a unique-constraint violation, a missing-row update/delete,
// and a dangling foreign key each surface a sensible HTTP status instead of
// falling through to a generic 500.
function mapPrismaError(err: Prisma.PrismaClientKnownRequestError): { status: number; code: string; message: string } | null {
  switch (err.code) {
    case "P2002": {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(", ") : "field";
      return { status: 409, code: "CONFLICT", message: `A record with this ${target} already exists` };
    }
    case "P2025":
      return { status: 404, code: "NOT_FOUND", message: "The requested record was not found" };
    case "P2003":
      return { status: 422, code: "UNPROCESSABLE", message: "This action references a record that doesn't exist or can't be modified" };
    default:
      return null;
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request body",
        details: err.errors,
      },
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = mapPrismaError(err);
    if (mapped) {
      return res.status(mapped.status).json({ success: false, error: { code: mapped.code, message: mapped.message } });
    }
  }

  req.log?.error({ err, requestId: req.requestId }, "unhandled error");
  // Stack traces / raw error messages never reach the client, in dev or prod —
  // req.log already captured the full detail server-side.
  return res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong", requestId: req.requestId },
  });
}
