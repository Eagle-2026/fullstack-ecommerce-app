import { Router } from "express";
import type { RequestHandler } from "express";

import { rateLimit } from "express-rate-limit";

import {
  register,
  login,
  logout,
  refresh,
  me,
  forgotPassword,
  resetPassword,
} from "../controllers/authController";

import {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validators/authValidators";

import { validate } from "../middleware/validate";
import { protect } from "../middleware/protect";
import { asyncHandler } from "../utils/asyncHandler";
import { logger } from "../utils/logger";

const router = Router();

// =====================================
// AUTHENTICATION EVENT AUDIT
// =====================================

// Log outcomes without recording passwords,
// emails, cookies, or JWTs.
function auditAuthEvent(eventName: string): RequestHandler {
  return (_req, res, next) => {
    res.once("finish", () => {
      const statusCode = res.statusCode;

      const outcome =
        statusCode === 429
          ? "rate_limited"
          : statusCode === 401
            ? "denied"
            : statusCode >= 400
              ? "rejected"
              : "completed";

      const details = {
        event: eventName,
        requestId: res.locals.requestId ?? "unknown",
        statusCode,
        outcome,
      };

      if (statusCode >= 500) {
        logger.error(details, "Authentication operation failed");
      } else if (statusCode >= 400) {
        logger.warn(details, "Authentication operation rejected");
      } else {
        logger.info(details, "Authentication operation completed");
      }
    });

    next();
  };
}

// =====================================
// RATE LIMITERS
// =====================================

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// =====================================
// SIGN UP
// =====================================

router.post(
  "/signup",
  auditAuthEvent("auth.signup"),
  signupLimiter,
  validate(signupSchema),
  asyncHandler(register),
);

// =====================================
// LOGIN
// =====================================

router.post(
  "/login",
  auditAuthEvent("auth.login"),
  loginLimiter,
  validate(loginSchema),
  asyncHandler(login),
);

// =====================================
// CURRENT USER
// =====================================

router.get("/me", protect, asyncHandler(me));

// =====================================
// REFRESH LOGIN
// =====================================

router.post("/refresh", auditAuthEvent("auth.refresh"), asyncHandler(refresh));

// =====================================
// LOGOUT
// =====================================

router.post("/logout", auditAuthEvent("auth.logout"), asyncHandler(logout));

// =====================================
// FORGOT PASSWORD
// =====================================

router.post(
  "/forgot-password",
  auditAuthEvent("auth.password_reset_requested"),
  resetLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(forgotPassword),
);

// =====================================
// RESET PASSWORD
// =====================================

router.post(
  "/reset-password",
  auditAuthEvent("auth.password_reset_completed"),
  resetLimiter,
  validate(resetPasswordSchema),
  asyncHandler(resetPassword),
);

export default router;
