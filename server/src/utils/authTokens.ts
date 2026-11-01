
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { Response } from "express";

export const ACCESS_COOKIE = "ecomAccess";
export const REFRESH_COOKIE = "ecomRefresh";

// Access token lasts up to 15 minutes.
export const ACCESS_MS = 15 * 60 * 1000;

// Maximum login session: 1 hour (60 minutes).
export const SESSION_MS = 60 * 60 * 1000;

// Keep this alias for compatibility with existing code.
export const REFRESH_MS = SESSION_MS;

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

const getSecret = (): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("A strong JWT_SECRET is required");
  }

  return secret;
};

// Find the real session deadline.
//
// For older sessions, use whichever comes first:
// 1. Stored MongoDB expiration.
// 2. One hour after the original login.
export const getSessionDeadline = (session: {
  createdAt: Date;
  expiresAt: Date;
}): Date => {
  const created = new Date(session.createdAt).getTime();
  const expires = new Date(session.expiresAt).getTime();

  if (
    !Number.isFinite(created) ||
    !Number.isFinite(expires)
  ) {
    throw new Error("Invalid session timestamps");
  }

  return new Date(
    Math.min(expires, created + SESSION_MS)
  );
};

export const createAccessToken = (
  userId: string,
  sessionId: string,
  authVersion: number,
  sessionExpiresAt: Date
): string => {
  // Never issue an access token that lasts longer
  // than the remaining session time.
  const remainingSeconds = Math.floor(
    (sessionExpiresAt.getTime() - Date.now()) / 1000
  );

  if (remainingSeconds <= 0) {
    throw new Error("Login session has expired");
  }

  const tokenSeconds = Math.min(
    ACCESS_MS / 1000,
    remainingSeconds
  );

  return jwt.sign(
    {
      sub: userId,
      sid: sessionId,
      ver: authVersion,
    },
    getSecret(),
    {
      algorithm: "HS256",
      expiresIn: tokenSeconds,
      issuer: "ecommerce-api",
      audience: "ecommerce-web",
    }
  );
};

export const verifyAccessToken = (
  token: string,
  ignoreExpiration = false
) => {
  const payload = jwt.verify(token, getSecret(), {
    algorithms: ["HS256"],
    issuer: "ecommerce-api",
    audience: "ecommerce-web",
    ignoreExpiration,
  });

  if (
    typeof payload === "string" ||
    typeof payload.sub !== "string" ||
    typeof payload.sid !== "string" ||
    typeof payload.ver !== "number"
  ) {
    throw new Error("Invalid token payload");
  }

  return {
    userId: payload.sub,
    sessionId: payload.sid,
    authVersion: payload.ver,
  };
};

export const newRefreshToken = (): string => {
  return crypto.randomBytes(32).toString("hex");
};

export const hashToken = (token: string): string => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

export const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string,
  sessionExpiresAt: Date
): void => {
  const remainingMs =
    sessionExpiresAt.getTime() - Date.now();

  if (remainingMs <= 0) {
    throw new Error("Cannot set expired session cookies");
  }

  res.cookie(ACCESS_COOKIE, accessToken, {
    ...cookieOptions,
    maxAge: Math.min(ACCESS_MS, remainingMs),
  });

  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...cookieOptions,
    maxAge: remainingMs,
  });
};

export const clearAuthCookies = (
  res: Response
): void => {
  res.clearCookie(ACCESS_COOKIE, cookieOptions);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
};
