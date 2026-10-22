import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import type {
  Request,
  Response,
  NextFunction,
} from "express";

import mongoose from "mongoose";

import authRoutes from "./routes/authRoutes";
import productRoutes from "./routes/productRoutes";

const app = express();

// =====================================
// SECURITY MIDDLEWARE
// =====================================

// Set security-related HTTP headers.
app.use(helmet());

// Allow our known frontend origin.
const clientUrl =
  process.env.CLIENT_URL || "http://localhost:3000";

app.use(
  cors({
    origin: clientUrl,
    credentials: true,
  })
);

// Limit JSON request size.
app.use(express.json({ limit: "10kb" }));

// Read authentication cookies.
app.use(cookieParser());

// Basic Origin and Fetch Metadata protection
// for requests that can change server data.
app.use("/api", (req, res, next) => {
  const safeMethods = ["GET", "HEAD", "OPTIONS"];

  if (safeMethods.includes(req.method)) {
    next();
    return;
  }

  const origin = req.get("origin");
  const fetchSite = req.get("sec-fetch-site");

  if (
    (origin && origin !== clientUrl) ||
    fetchSite === "cross-site"
  ) {
    res.status(403).json({
      message: "Request origin is not allowed",
    });
    return;
  }

  next();
});

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
// API ROUTES
// =====================================

// Day 2 authentication routes.
app.use("/api/v1/auth", authRoutes);

// Day 3 product routes.
app.use("/api/v1/products", productRoutes);

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
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
  ): void => {
    // Handle MongoDB duplicate-key errors.
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

    // Handle Mongoose validation errors.
    if (error instanceof mongoose.Error.ValidationError) {
      res.status(400).json({
        message: "Invalid database field values",
      });
      return;
    }

    // Handle invalid MongoDB identifiers.
    if (error instanceof mongoose.Error.CastError) {
      res.status(400).json({
        message: "Invalid resource identifier",
      });
      return;
    }

    // Log details on the server, not in the response.
    console.error("API error:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
);

export default app;