import { Router } from "express";

import { protect } from "../middleware/protect";
import { requireAdmin } from "../middleware/requireAdmin";
import { asyncHandler } from "../utils/asyncHandler";

import {
  getAdminSummary,
  getAdminOrders,
} from "../controllers/adminController";

const router = Router();

// Every route below requires authentication
// AND administrator authorization.
router.use(protect, requireAdmin);

// GET /api/v1/admin/summary
router.get("/summary", asyncHandler(getAdminSummary));

// GET /api/v1/admin/orders
router.get("/orders", asyncHandler(getAdminOrders));

export default router;
