import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Every API error follows { success: false, error: { code, message, details? } }.
// details[] (from Zod's .parse() failures) carries the specific field-level
// reason — e.g. "Password must contain an uppercase letter" — which the
// top-level message alone never does (it's always the generic "Invalid
// request body"). Prefer the first detail's message when present so the user
// sees what's actually wrong, not just that something was wrong.
//
// Deliberately mirrors the existing call-site shape (`extractErrorMessage(err)
// ?? "fallback"`) rather than taking the fallback itself, so every one of the
// ~45 existing `(err as {...})?.response?.data?.error?.message ?? "..."`
// call sites across the 3 apps can drop this in as a pure substitution
// without needing to also relocate each call's own custom fallback text.
export function extractErrorMessage(err: unknown): string | undefined {
  const response = (
    err as {
      response?: {
        data?: {
          error?: {
            message?: string;
            details?: Array<{ message?: string; path?: (string | number)[] }>;
          };
        };
      };
    }
  )?.response;
  const error = response?.data?.error;
  const detailMessages = (error?.details ?? [])
    .map((d) => d?.message)
    .filter((m): m is string => !!m);
  if (detailMessages.length > 0) return detailMessages.join("; ");
  return error?.message;
}

// Mirrors packages/validators/src/auth.ts's passwordSchema exactly (min 8,
// one lowercase, one uppercase, one number) — kept here too, not imported
// from validators, since these 3 apps' change-password pages need this text
// for an upfront hint and a same-tick client-side check, not just server
// validation after a round-trip.
export const PASSWORD_REQUIREMENTS_HINT = "At least 8 characters, with an uppercase letter, a lowercase letter, and a number.";

export function validatePasswordClientSide(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain a number";
  return null;
}
