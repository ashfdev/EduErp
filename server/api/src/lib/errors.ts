export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown[],
  ) {
    super(message);
  }
}

export const notFound = (message = "Not found") => new ApiError(404, "NOT_FOUND", message);
export const badRequest = (message: string, details?: unknown[]) =>
  new ApiError(400, "VALIDATION_ERROR", message, details);
export const unauthorized = (message = "Unauthorized") => new ApiError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "Forbidden") => new ApiError(403, "FORBIDDEN", message);
export const conflict = (message: string) => new ApiError(409, "CONFLICT", message);
