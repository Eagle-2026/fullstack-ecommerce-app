
import pino from "pino";

// =====================================
// SECURITY LOGGING CONFIGURATION
// =====================================

const allowedLevels = new Set([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
]);

const requestedLevel = process.env.LOG_LEVEL;

const logLevel =
  requestedLevel && allowedLevels.has(requestedLevel)
    ? requestedLevel
    : "info";

// =====================================
// CENTRAL LOGGER
// =====================================

export const logger = pino({
  level: logLevel,

  base: {
    service: "ecommerce-api",
  },

  // Extra protection if a sensitive property
  // is accidentally included in a future log.
  //
  // IMPORTANT:
  // Never deliberately log complete requests,
  // response bodies, cookies, or user objects.
  redact: {
    paths: [
      "password",
      "newPassword",
      "token",
      "accessToken",
      "refreshToken",
      "resetToken",
      "authorization",
      "cookie",
      "headers.authorization",
      "headers.cookie",
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.password",
      "req.body.newPassword",
      "req.body.token",
      "request.body.password",
      "request.body.newPassword",
    ],
    censor: "[REDACTED]",
  },
});
