import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";

import type { Request, Response, NextFunction } from "express";

import { verifyRequestOrigin } from "./middleware/verifyRequestOrigin";
import { requestLogger } from "./middleware/requestLogger";

import { logger } from "./utils/logger";

import authRoutes from "./routes/authRoutes";
import productRoutes from "./routes/productRoutes";
import orderRoutes from "./routes/orderRoutes";
import adminRoutes from "./routes/adminRoutes";

import { stripeWebhook } from "./controllers/stripeWebhookController";

const app = express();
// =====================================
// TRUST PROXY — RENDER DEPLOYMENT
// =====================================

// Render runs Express behind a reverse proxy.
// Trust the nearest proxy hop in production.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// =====================================
// REQUEST LOGGING
// =====================================

// Must run early so it can observe
// successful requests and failed requests.
app.use(requestLogger);

// =====================================
// SECURITY MIDDLEWARE
// =====================================

app.use(helmet());

const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

app.use(
  cors({
    origin: clientUrl,
    credentials: true,
    exposedHeaders: ["X-Request-ID"],
  }),
);

// =====================================
// STRIPE WEBHOOK
// MUST RUN BEFORE express.json()
// =====================================

// Keep the original raw body for
// Stripe signature verification.
app.post(
  "/api/v1/stripe/webhook",
  express.raw({
    type: "application/json",
    limit: "100kb",
  }),
  stripeWebhook,
);

// =====================================
// NORMAL APPLICATION MIDDLEWARE
// =====================================

app.use(
  express.json({
    limit: "10kb",
  }),
);

app.use(cookieParser());

// Reject untrusted origins for requests
// that modify application data.
app.use("/api", verifyRequestOrigin);

// =====================================
// HEALTH CHECK
// =====================================

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "success",
    message: "E-commerce API is running",
  });
});

// =====================================
// AUTHENTICATION ROUTES
// =====================================

app.use("/api/v1/auth", authRoutes);

// =====================================
// PRODUCT ROUTES
// =====================================

app.use("/api/v1/products", productRoutes);

// =====================================
// ORDER ROUTES
// =====================================

app.use("/api/v1/orders", orderRoutes);

// =====================================
// ADMIN ROUTES
// =====================================

app.use("/api/v1/admin", adminRoutes);

// =====================================
// UNKNOWN API ROUTES
// =====================================

app.use("/api", (_req, res) => {
  res.status(404).json({
    message: "API endpoint not found",
  });
});

// =====================================
// CENTRALIZED ERROR HANDLER
// =====================================

app.use(
  (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    // Duplicate unique database value.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      res.status(409).json({
        message: "A value that must be unique already exists",
      });
      return;
    }

    // Invalid Mongoose document data.
    if (error instanceof mongoose.Error.ValidationError) {
      res.status(400).json({
        message: "Invalid database field values",
      });
      return;
    }

    // Invalid database identifier.
    if (error instanceof mongoose.Error.CastError) {
      res.status(400).json({
        message: "Invalid resource identifier",
      });
      return;
    }

    // Log an unexpected failure safely.
    //
    // Do not log the complete error object.
    // It could contain database or request details.
    logger.error(
      {
        event: "api.unexpected_error",
        requestId: res.locals.requestId ?? "unknown",
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
      "Unexpected API failure",
    );

    // Never expose internal stack traces.
    res.status(500).json({
      message: "Internal server error",
    });
  },
);

export default app;
