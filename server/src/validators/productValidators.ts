import { z } from "zod";

const imageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => {
      if (value === "") return true;

      // Accept images stored in our public folder.
      const isLocalImage =
        /^\/productsImages\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(value);

      if (isLocalImage) return true;

      // Also accept HTTPS image URLs.
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    },
    {
      message: "Use an HTTPS URL or a valid local product image path",
    },
  );

export const createProductSchema = z
  .object({
    name: z.string().trim().min(2).max(120),

    slug: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Use lowercase letters, numbers, and hyphens",
      ),

    description: z.string().trim().min(10).max(2000),

    priceCents: z.number().int().safe().min(1),

    category: z.string().trim().min(2).max(60),

    imageUrl: imageUrlSchema.optional(),

    stock: z.number().int().safe().min(0).optional(),

    isActive: z.boolean().optional(),
  })
  .strict();

export const updateProductSchema = createProductSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const productQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),

    limit: z.coerce.number().int().min(1).max(20).default(10),

    search: z.string().trim().max(60).optional(),

    category: z.string().trim().max(60).optional(),

    sort: z
      .enum(["newest", "price_asc", "price_desc", "name_asc"])
      .default("newest"),
  })
  .strict();

export const productIdSchema = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid product ID");

export const productSlugSchema = z
  .string()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid product slug");
