import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import type {
  Request,
  Response,
  NextFunction,
} from "express";

import authRoutes from "./routes/authRoutes";

const app = express();

// Security headers
app.use(helmet());

// Do not trust arbitrary proxy headers by default.
// Configure trusted proxies when deploying.

// Allow our known frontend origin.
const clientUrl =
  process.env.CLIENT_URL || "http://localhost:3000";

app.use(
  cors({
    origin: clientUrl,
    credentials: true,
  })
);

// Limit incoming JSON data.
app.use(express.json({ limit: "10kb" }));

// Parse HttpOnly cookies from incoming requests.
app.use(cookieParser());

// Basic browser-origin protection for write requests.
// This complements SameSite cookies.
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

// Existing health endpoint
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "success",
    message: "E-commerce API is running",
  });
});

// Authentication API
app.use("/api/v1/auth", authRoutes);

// Unknown API route
app.use("/api", (_req, res) => {
  res.status(404).json({
    message: "API endpoint not found",
  });
});

// Centralized error handler
app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    // Duplicate email / unique index conflict
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      res.status(409).json({
        message: "An account with this email already exists",
      });
      return;
    }
    console.error("API error:", error);
    res.status(500).json({
      message: "Internal server error",
    });
  }
);

export default app;