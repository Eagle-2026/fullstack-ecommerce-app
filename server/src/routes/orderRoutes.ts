import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import { protect } from "../middleware/protect";
import { validate } from "../middleware/validate";

import { createCheckoutSchema } from "../validators/orderValidators";

import {
  createCheckout,
  getMyOrders,
  getMyOrderById,
  verifyMyOrderPayment,
} from "../controllers/orderController";

const router = Router();

// =====================================
// CHECKOUT RATE LIMIT
// =====================================

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many checkout attempts. Try again later.",
  },
});

// =====================================
// PAYMENT VERIFICATION RATE LIMIT
// =====================================

const paymentVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many verification attempts. Try again later.",
  },
});

// =====================================
// CREATE STRIPE CHECKOUT
// =====================================

router.post(
  "/checkout",
  protect,
  checkoutLimiter,
  validate(createCheckoutSchema),
  createCheckout,
);

// =====================================
// VERIFY OWN PAYMENT WITH STRIPE
// =====================================

// POST is required because payment verification
// may update the order in MongoDB.
//
// The app-level verifyRequestOrigin middleware
// also checks this request before it reaches here.
router.post(
  "/:orderId/verify-payment",
  protect,
  paymentVerificationLimiter,
  verifyMyOrderPayment,
);

// =====================================
// GET MY ORDERS
// =====================================

router.get("/", protect, getMyOrders);

// =====================================
// GET ONE OF MY ORDERS
// =====================================

router.get("/:orderId", protect, getMyOrderById);

export default router;
