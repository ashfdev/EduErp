// Re-export every Prisma-generated model type + enum so app code never
// imports `@prisma/client` directly.
export * from "@education-erp/db";

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// Event.type is a free-form string on the schema (no Prisma enum, to avoid
// a breaking migration on existing rows) — this is the single known-value
// list both apps/website's calendar (for color-coding) and apps/admin's
// event form (for a constrained dropdown instead of free text) share, so
// the two can never drift out of sync the way they did before this existed.
export const EVENT_TYPES = ["EXAM", "HOLIDAY", "GENERAL", "MEETING", "ADMISSION"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface JwtAccessPayload {
  sub: string;
  role: string;
  portal: "admin" | "portal";
}
