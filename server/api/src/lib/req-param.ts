import type { Request } from "express";
import { badRequest } from "./errors";

// Express 5's ParamsDictionary types values as `string | string[]` (to account
// for repeated-match route patterns like `/:id+`) — none of our routes use
// those, so any array value here means something is genuinely wrong with the
// request rather than a type-only formality to cast away.
export function reqParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string") {
    throw badRequest(`Missing or invalid path parameter: ${name}`);
  }
  return value;
}
