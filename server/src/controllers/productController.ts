import type { Request, Response } from "express";
import type { QueryFilter } from "mongoose";

import Product, { type IProduct } from "../models/Product";

import {
  productQuerySchema,
  productIdSchema,
  productSlugSchema,
} from "../validators/productValidators";

// Escape special regex characters in search text.
const escapeRegex = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

type ProductSort = "newest" | "price_asc" | "price_desc" | "name_asc";

const sortOptions: Record<ProductSort, Record<string, 1 | -1>> = {
  newest: {
    createdAt: -1,
    _id: -1,
  },

  price_asc: {
    priceCents: 1,
    _id: 1,
  },

  price_desc: {
    priceCents: -1,
    _id: -1,
  },

  name_asc: {
    name: 1,
    _id: 1,
  },
};

// Reusable listing logic for public and admin APIs.
const sendProductList = async (
  req: Request,
  res: Response,
  includeInactive: boolean,
): Promise<void> => {
  const result = productQuerySchema.safeParse(req.query);

  if (!result.success) {
    res.status(400).json({
      status: "fail",
      message: "Invalid product query",
    });
    return;
  }

  const { page, limit, search, category, sort } = result.data;

  const filter: QueryFilter<IProduct> = {};

  // Customers only see active products.
  if (!includeInactive) {
    filter.isActive = true;
  }

  // Filter by exact category.
  if (category) {
    filter.category = category;
  }

  // Search product names and descriptions.
  if (search) {
    const safeSearch = escapeRegex(search);

    filter.$or = [
      {
        name: {
          $regex: safeSearch,
          $options: "i",
        },
      },
      {
        description: {
          $regex: safeSearch,
          $options: "i",
        },
      },
    ];
  }

  const skip = (page - 1) * limit;

  const [products, total] = await Promise.all([
    Product.find(filter).sort(sortOptions[sort]).skip(skip).limit(limit).lean(),

    Product.countDocuments(filter),
  ]);

  res.status(200).json({
    status: "success",
    data: {
      products,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
};

// =====================================
// GET PUBLIC PRODUCTS
// =====================================
export const getPublicProducts = async (
  req: Request,
  res: Response,
): Promise<void> => {
  await sendProductList(req, res, false);
};

// =====================================
// GET ALL PRODUCTS FOR ADMIN
// =====================================
export const getAdminProducts = async (
  req: Request,
  res: Response,
): Promise<void> => {
  await sendProductList(req, res, true);
};

// =====================================
// GET ONE PUBLIC PRODUCT BY SLUG
// =====================================
export const getProductBySlug = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const result = productSlugSchema.safeParse(req.params.slug);

  if (!result.success) {
    res.status(400).json({
      message: "Invalid product slug",
    });
    return;
  }

  const product = await Product.findOne({
    slug: result.data,
    isActive: true,
  }).lean();

  if (!product) {
    res.status(404).json({
      message: "Product not found",
    });
    return;
  }

  res.status(200).json({
    status: "success",
    data: {
      product,
    },
  });
};

// =====================================
// CREATE PRODUCT - ADMIN ONLY
// =====================================
export const createProduct = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const product = await Product.create(req.body);

  res.status(201).json({
    status: "success",
    message: "Product created successfully",
    data: {
      product,
    },
  });
};

// =====================================
// UPDATE PRODUCT - ADMIN ONLY
// =====================================
export const updateProduct = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const result = productIdSchema.safeParse(req.params.id);

  if (!result.success) {
    res.status(400).json({
      message: "Invalid product ID",
    });
    return;
  }

  const product = await Product.findByIdAndUpdate(
    result.data,
    {
      $set: req.body,
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!product) {
    res.status(404).json({
      message: "Product not found",
    });
    return;
  }

  res.status(200).json({
    status: "success",
    message: "Product updated successfully",
    data: {
      product,
    },
  });
};

// =====================================
// DEACTIVATE PRODUCT - ADMIN ONLY
// =====================================
export const deactivateProduct = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const result = productIdSchema.safeParse(req.params.id);

  if (!result.success) {
    res.status(400).json({
      message: "Invalid product ID",
    });
    return;
  }

  const product = await Product.findByIdAndUpdate(
    result.data,
    {
      $set: {
        isActive: false,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!product) {
    res.status(404).json({
      message: "Product not found",
    });
    return;
  }

  res.status(200).json({
    status: "success",
    message: "Product deactivated successfully",
    data: {
      product,
    },
  });
};
