import { randomUUID } from "node:crypto";
import type { Request, RequestHandler } from "express";

import { logger } from "../utils/logger";

// =====================================
// GET SAFE ROUTE NAME
// =====================================

// Do not log the original request URL.
// URL query strings may contain private data.
//
// Express route patterns are safer because
// they do not contain actual customer IDs.
function getSafeRouteName(req: Request): string {
  const routePath = req.route?.path;

  if (typeof routePath !== "string") {
    return "unmatched";
  }

  return `${req.baseUrl}${routePath}`;
}

// =====================================
// REQUEST LOGGING MIDDLEWARE
// =====================================

export const requestLogger: RequestHandler = (req, res, next): void => {
  // Step 1: Generate a new server-side request ID.
  const requestId = randomUUID();

  res.locals.requestId = requestId;

  // Step 2: Include the ID in the HTTP response.
  // This helps us connect an error to its log.
  res.setHeader("X-Request-ID", requestId);

  // Step 3: Start measuring the request duration.
  const startedAt = process.hrtime.bigint();

  // Step 4: Log when the response is finished.
  res.once("finish", () => {
    const elapsed = process.hrtime.bigint() - startedAt;

    const durationMs = Math.round(Number(elapsed) / 1_000_000);

    // Log only approved metadata.
    // Never log request bodies, cookies,
    // credentials, or authorization headers.
    const details = {
      event: "http.request_completed",
      requestId,
      method: req.method,
      route: getSafeRouteName(req),
      statusCode: res.statusCode,
      durationMs,
    };

    if (res.statusCode >= 500) {
      logger.error(details, "HTTP request completed");
    } else if (
      res.statusCode === 401 ||
      res.statusCode === 403 ||
      res.statusCode === 429
    ) {
      logger.warn(details, "HTTP request completed");
    } else {
      logger.info(details, "HTTP request completed");
    }
  });

  next();
};
