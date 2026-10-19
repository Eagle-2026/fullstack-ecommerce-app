import express from "express";
import cors from "cors";
import helmet from "helmet";

const app = express();

// Security headers
app.use(helmet());

// Allow our Next.js frontend to communicate with Express
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

// Parse incoming JSON and limit request body size
app.use(express.json({ limit: "10kb" }));

// Health check route
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "success",
    message: "E-commerce API is running",
  });
});

export default app;