import type { Request, Response } from "express";
import crypto from "node:crypto";
import bcrypt from "bcrypt";

import User, { type IUser } from "../models/User";
import Session from "../models/Session";

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_MS,
  createAccessToken,
  newRefreshToken,
  hashToken,
  verifyAccessToken,
  setAuthCookies,
  clearAuthCookies,
} from "../utils/authTokens";

import { sendResetEmail } from "../services/resetEmail";

// Return only safe customer information.
const safeUser = (user: IUser) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
});

// Create a new login session.
const startSession = async (
  user: IUser,
  res: Response,
  statusCode: number,
): Promise<void> => {
  const refreshToken = newRefreshToken();

  const session = await Session.create({
    user: user._id,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_MS),
    revoked: false,
  });

  const accessToken = createAccessToken(
    user._id.toString(),
    session._id.toString(),
    user.authVersion,
  );

  setAuthCookies(res, accessToken, refreshToken);

  res.status(statusCode).json({
    status: "success",
    data: {
      user: safeUser(user),
    },
  });
};

// =====================================
// REGISTER
// =====================================
export const register = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password } = req.body;
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    res.status(409).json({
      message: "An account with this email already exists",
    });
    return;
  }
  // The User model hashes the password.
  const user = await User.create({
    name,
    email,
    password,
  });
  await startSession(user, res, 201);
};

// =====================================
// LOGIN
// =====================================
export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  const user = await User.findOne({
    email,
  }).select("+password");

  if (!user || !(await user.comparePassword(password))) {
    res.status(401).json({
      message: "Invalid email or password",
    });
    return;
  }

  await startSession(user, res, 200);
};

// =====================================
// CURRENT CUSTOMER
// =====================================
export const me = async (req: Request, res: Response): Promise<void> => {
  const user = await User.findById(req.auth?.userId);

  if (!user) {
    res.status(401).json({
      message: "Customer not found",
    });
    return;
  }

  res.status(200).json({
    status: "success",
    data: {
      user: safeUser(user),
    },
  });
};

// =====================================
// REFRESH AUTHENTICATION
// =====================================
export const refresh = async (req: Request, res: Response): Promise<void> => {
  const oldToken = req.cookies?.[REFRESH_COOKIE];

  if (typeof oldToken !== "string") {
    res.status(401).json({
      message: "Refresh token missing",
    });
    return;
  }

  const newToken = newRefreshToken();

  // Atomic update: the old refresh token can
  // only be exchanged successfully once.
  const session = await Session.findOneAndUpdate(
    {
      refreshTokenHash: hashToken(oldToken),
      revoked: false,
      expiresAt: { $gt: new Date() },
    },
    {
      $set: {
        refreshTokenHash: hashToken(newToken),
        expiresAt: new Date(Date.now() + REFRESH_MS),
      },
    },
    { new: true },
  );

  if (!session) {
    clearAuthCookies(res);

    res.status(401).json({
      message: "Invalid or expired refresh session",
    });
    return;
  }

  const user = await User.findById(session.user);

  if (!user) {
    await Session.findByIdAndUpdate(session._id, {
      revoked: true,
    });
    clearAuthCookies(res);
    res.status(401).json({
      message: "Customer no longer exists",
    });
    return;
  }

  const accessToken = createAccessToken(
    user._id.toString(),
    session._id.toString(),
    user.authVersion,
  );

  setAuthCookies(res, accessToken, newToken);

  res.status(200).json({
    status: "success",
    message: "Session refreshed",
  });
};

// =====================================
// LOGOUT
// =====================================
export const logout = async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  const accessToken = req.cookies?.[ACCESS_COOKIE];

  // Revoke using the refresh token when present.
  if (typeof refreshToken === "string") {
    await Session.updateOne(
      { refreshTokenHash: hashToken(refreshToken) },
      { $set: { revoked: true } },
    );
  }

  // Also revoke through a valid signed access token,
  // including an expired one from the same session.
  if (typeof accessToken === "string") {
    try {
      const payload = verifyAccessToken(accessToken, true);

      await Session.findByIdAndUpdate(payload.sessionId, {
        revoked: true,
      });
    } catch {
      // An invalid access token does not stop logout.
    }
  }

  clearAuthCookies(res);

  res.status(200).json({
    status: "success",
    message: "Logged out successfully",
  });
};

// =====================================
// FORGOT PASSWORD
// =====================================
export const forgotPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { email } = req.body;

  const genericMessage =
    "If an account exists, password reset instructions will be available.";

  const user = await User.findOne({ email });

  if (user) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    user.resetTokenHash = hashToken(rawToken);
    user.resetTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await user.save();

    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

    // Fragment tokens are not sent in HTTP requests.
    const resetUrl = `${clientUrl}/reset-password#token=${rawToken}`;
    await sendResetEmail(user.email, resetUrl);
  }

  // Same response whether the email exists or not.
  res.status(200).json({
    status: "success",
    message: genericMessage,
  });
};

// =====================================
// RESET PASSWORD
// =====================================
export const resetPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { token, password } = req.body;

  const tokenHash = hashToken(token);

  // Hash manually because findOneAndUpdate does
  // not run our pre("save") password hook.
  const passwordHash = await bcrypt.hash(password, 12);

  // Atomically consume the reset token.
  const user = await User.findOneAndUpdate(
    {
      resetTokenHash: tokenHash,
      resetTokenExpiresAt: { $gt: new Date() },
    },
    {
      $set: {
        password: passwordHash,
      },
      $unset: {
        resetTokenHash: "",
        resetTokenExpiresAt: "",
      },
      $inc: {
        authVersion: 1,
      },
    },
    { new: true },
  );

  if (!user) {
    res.status(400).json({
      message: "Invalid or expired reset link",
    });
    return;
  }

  // Revoke every old login after password reset.
  await Session.updateMany({ user: user._id }, { $set: { revoked: true } });

  clearAuthCookies(res);

  res.status(200).json({
    status: "success",
    message: "Password updated. Please log in again.",
  });
};
