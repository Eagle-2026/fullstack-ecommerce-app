import "dotenv/config";

import mongoose from "mongoose";

import { connectDB } from "../config/db";
import Product from "../models/Product";

const sampleProducts = [
  {
    name: "Wireless Mouse",
    slug: "wireless-mouse",
    description:
      "Ergonomic wireless mouse with a USB receiver.",
    priceCents: 2999,
    category: "Electronics",
    imageUrl: "",
    stock: 25,
    isActive: true,
  },

  {
    name: "Mechanical Keyboard",
    slug: "mechanical-keyboard",
    description:
      "Mechanical keyboard with comfortable tactile keys.",
    priceCents: 4999,
    category: "Electronics",
    imageUrl: "",
    stock: 15,
    isActive: true,
  },

  {
    name: "Stainless Steel Water Bottle",
    slug: "stainless-steel-water-bottle",
    description:
      "Reusable stainless steel bottle for daily hydration.",
    priceCents: 1899,
    category: "Lifestyle",
    imageUrl: "",
    stock: 30,
    isActive: true,
  },

  {
    name: "Hardcover Notebook",
    slug: "hardcover-notebook",
    description:
      "Durable hardcover notebook for work and study.",
    priceCents: 1299,
    category: "Office",
    imageUrl: "",
    stock: 50,
    isActive: true,
  },
];

const seedProducts = async (): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Do not run sample product seeding in production"
    );
  }

  try {
    await connectDB();

    // Make sure Product indexes are initialized.
    await Product.init();

    for (const product of sampleProducts) {
      // Insert the product only if its slug is missing.
      await Product.updateOne(
        { slug: product.slug },
        {
          $setOnInsert: product,
        },
        {
          upsert: true,
          runValidators: true,
        }
      );
    }

    const count = await Product.countDocuments();

    console.log("Sample product seeding completed");
    console.log(`Products in database: ${count}`);
  } finally {
    await mongoose.disconnect();
  }
};

seedProducts().catch((error: unknown) => {
  console.error("Seeding failed:", error);
  process.exitCode = 1;
});
