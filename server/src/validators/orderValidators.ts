import { z } from "zod";

const checkoutItemSchema = z
  .object({
    slug: z
      .string()
      .min(2)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid product slug"),

    quantity: z.number().int().min(1).max(20),
  })
  .strict();

export const createCheckoutSchema = z
  .object({
    items: z
      .array(checkoutItemSchema)
      .min(1, "Cart cannot be empty")
      .max(20, "Too many different products"),
  })
  .strict()
  .superRefine((data, ctx) => {
    const seen = new Set<string>();

    data.items.forEach((item, index) => {
      if (seen.has(item.slug)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "slug"],
          message: "Duplicate product in cart",
        });
      }

      seen.add(item.slug);
    });
  });

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
