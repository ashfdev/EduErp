import { OpenAPIRegistry, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Patches the shared `z` import so every existing Zod schema in this codebase
// (packages/validators/*, and any inline schema in a routes.ts file) gains an
// optional `.openapi({...})` method for free — schemas do not need to be
// rewritten to be documented, only registered below.
extendZodWithOpenApi(z);

// Single shared registry — every module that wants to appear in the
// generated spec calls `registry.registerPath(...)` (for a route) and/or
// `registry.register(name, schema)` (for a reusable response/request shape)
// against this same instance. Import this file for its registration side
// effects before generating the document (see generate.ts).
export const registry = new OpenAPIRegistry();

// Shared building blocks reused by nearly every registered route.
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().openapi({ example: "VALIDATION_ERROR" }),
    message: z.string(),
    details: z.array(z.unknown()).optional(),
  }),
});

export const PaginationMetaSchema = z.object({
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

export function successResponse<T extends z.ZodTypeAny>(dataSchema: T, opts?: { paginated?: boolean }) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    ...(opts?.paginated ? { meta: PaginationMetaSchema } : {}),
  });
}

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "Obtain via POST /api/auth/login — send as `Authorization: Bearer <access_token>`.",
});
