
import { Router } from "express";
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

const router = Router();

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

router.post(
  "/signup",
  signupLimiter,
  validate(signupSchema),
  asyncHandler(register)
);

router.post(
  "/login",
  loginLimiter,
  validate(loginSchema),
  asyncHandler(login)
);

router.get("/me", protect, asyncHandler(me));

router.post("/refresh", asyncHandler(refresh));

router.post("/logout", asyncHandler(logout));

router.post(
  "/forgot-password",
  resetLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(forgotPassword)
);

router.post(
  "/reset-password",
  resetLimiter,
  validate(resetPasswordSchema),
  asyncHandler(resetPassword)
);

export default router;