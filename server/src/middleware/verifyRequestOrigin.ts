import type { RequestHandler } from "express";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export const verifyRequestOrigin: RequestHandler = (req, res, next): void => {
  // Reading data does not need this check.
  if (safeMethods.has(req.method)) {
    next();
    return;
  }

  // Block browser requests clearly marked cross-site.
  const fetchSite = req.get("sec-fetch-site");

  if (fetchSite === "cross-site") {
    res.status(403).json({
      message: "Request origin is not allowed",
    });
    return;
  }

  const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

  const allowedOrigin = new URL(clientUrl).origin;

  // Check the Origin header first.
  let requestOrigin = req.get("origin");

  // If Origin is missing, try Referer.
  if (!requestOrigin) {
    const referer = req.get("referer");

    if (referer) {
      try {
        requestOrigin = new URL(referer).origin;
      } catch {
        // An invalid Referer will be rejected below.
      }
    }
  }

  // Missing, invalid, or untrusted origin.
  if (requestOrigin !== allowedOrigin) {
    res.status(403).json({
      message: "Request origin is not allowed",
    });
    return;
  }

  next();
};
