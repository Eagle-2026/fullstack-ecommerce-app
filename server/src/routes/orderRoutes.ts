import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import { protect } from "../middleware/protect";
import { validate } from "../middleware/validate";

import { createCheckoutSchema } from "../validators/orderValidators";

import {
  createCheckout,
  getMyOrders,
  getMyOrderById,
} from "../controllers/orderController";

const router = Router();

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many checkout attempts. Try again later.",
  },
});

// Create order and payment session.
router.post(
  "/checkout",
  protect,
  checkoutLimiter,
  validate(createCheckoutSchema),
  createCheckout,
);

// View the authenticated customer's orders.
router.get("/", protect, getMyOrders);

// View a specific owned order.
router.get("/:orderId", protect, getMyOrderById);

export default router;
