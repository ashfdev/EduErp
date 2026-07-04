import type { JwtAccessPayload } from "@education-erp/types";

declare global {
  namespace Express {
    interface Request {
      user?: JwtAccessPayload;
      requestId: string;
    }
  }
}

export {};
