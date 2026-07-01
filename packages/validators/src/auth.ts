import { z } from "zod";

export const bdPhoneSchema = z
  .string()
  .regex(/^01\d{9}$/, "Phone must be 11 digits starting with 01");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number");

export const loginSchema = z.object({
  identifier: z.string().min(1, "Phone or email is required"),
  password: z.string().min(1, "Password is required"),
  portal: z.enum(["admin", "portal"]),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    old_password: z.string().min(1),
    new_password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

export const forgotPasswordSchema = z.object({
  phone: bdPhoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: bdPhoneSchema,
  otp: z.string().length(6),
});

export const resetPasswordSchema = z
  .object({
    reset_token: z.string().min(1),
    new_password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });
