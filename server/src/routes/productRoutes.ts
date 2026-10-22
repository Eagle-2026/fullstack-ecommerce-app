import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import {
  getPublicProducts,
  getAdminProducts,
  getProductBySlug,
  createProduct,
  updateProduct,
  deactivateProduct,
} from "../controllers/productController";

import {
  createProductSchema,
  updateProductSchema,
} from "../validators/productValidators";

import { protect } from "../middleware/protect";
import { requireAdmin } from "../middleware/requireAdmin";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Basic protection against excessive admin writes.
const adminWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// =====================================
// PUBLIC ROUTES
// =====================================

// GET /api/v1/products
router.get("/", asyncHandler(getPublicProducts));

// =====================================
// ADMIN ROUTES
// =====================================

// GET /api/v1/products/admin/all
router.get("/admin/all", protect, requireAdmin, asyncHandler(getAdminProducts));

// POST /api/v1/products
router.post(
  "/",
  protect,
  requireAdmin,
  adminWriteLimiter,
  validate(createProductSchema),
  asyncHandler(createProduct),
);

// PATCH /api/v1/products/:id
router.patch(
  "/:id",
  protect,
  requireAdmin,
  adminWriteLimiter,
  validate(updateProductSchema),
  asyncHandler(updateProduct),
);

// DELETE /api/v1/products/:id
router.delete(
  "/:id",
  protect,
  requireAdmin,
  adminWriteLimiter,
  asyncHandler(deactivateProduct),
);

// =====================================
// PUBLIC PRODUCT DETAILS
// =====================================

// GET /api/v1/products/:slug
router.get("/:slug", asyncHandler(getProductBySlug));

export default router;
