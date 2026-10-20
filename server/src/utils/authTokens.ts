
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { Response } from "express";

export const ACCESS_COOKIE = "ecomAccess";
export const REFRESH_COOKIE = "ecomRefresh";

export const ACCESS_MS = 15 * 60 * 1000;
export const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

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

export const createAccessToken = (
  userId: string,
  sessionId: string,
  authVersion: number
): string => {
  return jwt.sign(
    {
      sub: userId,
      sid: sessionId,
      ver: authVersion,
    },
    getSecret(),
    {
      algorithm: "HS256",
      expiresIn: "15m",
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
  refreshToken: string
): void => {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...cookieOptions,
    maxAge: ACCESS_MS,
  });

  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...cookieOptions,
    maxAge: REFRESH_MS,
  });
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie(ACCESS_COOKIE, cookieOptions);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
};
