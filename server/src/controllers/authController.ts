import type { Request, Response } from "express";
import crypto from "node:crypto";
import bcrypt from "bcrypt";

import User, { type IUser } from "../models/User";
import Session from "../models/Session";

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  SESSION_MS,
  createAccessToken,
  newRefreshToken,
  hashToken,
  verifyAccessToken,
  setAuthCookies,
  clearAuthCookies,
  getSessionDeadline,
} from "../utils/authTokens";

import { sendResetEmail } from "../services/resetEmail";

// Return only safe customer information.
const safeUser = (user: IUser) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
});

// =====================================
// CREATE LOGIN SESSION
// =====================================
const startSession = async (
  user: IUser,
  res: Response,
  statusCode: number,
): Promise<void> => {
  const refreshToken = newRefreshToken();

  // Original login time determines expiration.
  const expiresAt = new Date(Date.now() + SESSION_MS);

  const session = await Session.create({
    user: user._id,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt,
    revoked: false,
  });

  const deadline = getSessionDeadline(session);

  const accessToken = createAccessToken(
    user._id.toString(),
    session._id.toString(),
    user.authVersion,
    deadline,
  );

  setAuthCookies(res, accessToken, refreshToken, deadline);

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

  // Password hashing is handled by User model.
  // Never accept an admin role from registration.
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
  const now = new Date();

  // Atomically rotate the refresh token.
  //
  // IMPORTANT:
  // Do not extend expiresAt.
  // Reject sessions created over 1 hour ago.
  const session = await Session.findOneAndUpdate(
    {
      refreshTokenHash: hashToken(oldToken),
      revoked: false,
      expiresAt: { $gt: now },
      createdAt: {
        $gt: new Date(now.getTime() - SESSION_MS),
      },
    },
    {
      $set: {
        refreshTokenHash: hashToken(newToken),
      },
    },
    {
      returnDocument: "after",
    },
  );

  if (!session) {
    clearAuthCookies(res);

    res.status(401).json({
      message: "Invalid or expired refresh session",
    });
    return;
  }

  const deadline = getSessionDeadline(session);

  // Double-check the absolute expiration.
  if (deadline.getTime() - Date.now() < 1000) {
    await Session.updateOne({ _id: session._id }, { $set: { revoked: true } });

    clearAuthCookies(res);

    res.status(401).json({
      message: "Login session has expired",
    });
    return;
  }

  const user = await User.findById(session.user);

  if (!user) {
    await Session.updateOne({ _id: session._id }, { $set: { revoked: true } });

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
    deadline,
  );

  setAuthCookies(res, accessToken, newToken, deadline);

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

  try {
    if (typeof refreshToken === "string") {
      await Session.updateOne(
        { refreshTokenHash: hashToken(refreshToken) },
        { $set: { revoked: true } },
      );
    }

    let sessionId: string | null = null;

    if (typeof accessToken === "string") {
      try {
        sessionId = verifyAccessToken(accessToken, true).sessionId;
      } catch {
        // Ignore invalid access tokens.
      }
    }

    if (sessionId) {
      await Session.updateOne({ _id: sessionId }, { $set: { revoked: true } });
    }
  } finally {
    clearAuthCookies(res);
  }

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

    const resetUrl = `${clientUrl}/reset-password#token=${rawToken}`;

    await sendResetEmail(user.email, resetUrl);
  }

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

  // findOneAndUpdate does not run the
  // User model's pre-save password hook.
  const passwordHash = await bcrypt.hash(password, 12);

  // Consume the reset token exactly once.
  const user = await User.findOneAndUpdate(
    {
      resetTokenHash: tokenHash,
      resetTokenExpiresAt: {
        $gt: new Date(),
      },
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
    {
      returnDocument: "after",
    },
  );

  if (!user) {
    res.status(400).json({
      message: "Invalid or expired reset link",
    });
    return;
  }

  // Revoke all existing customer sessions.
  await Session.updateMany({ user: user._id }, { $set: { revoked: true } });

  clearAuthCookies(res);

  res.status(200).json({
    status: "success",
    message: "Password updated. Please log in again.",
  });
};
