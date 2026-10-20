
import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please provide a valid email")
  .max(254);

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(72, "Password is too long")
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must be no more than 72 UTF-8 bytes"
  );

export const signupSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    password: passwordSchema,
  })
  .strict();