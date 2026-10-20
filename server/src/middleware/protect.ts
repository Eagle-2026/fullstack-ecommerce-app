
import type {
  Request,
  Response,
  NextFunction,
} from "express";

import User from "../models/User";
import Session from "../models/Session";

import {
  ACCESS_COOKIE,
  verifyAccessToken,
} from "../utils/authTokens";

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.cookies?.[ACCESS_COOKIE];

    if (typeof token !== "string") {
      res.status(401).json({
        message: "Not authenticated",
      });
      return;
    }

    const payload = verifyAccessToken(token);

    // Verify that the login session is still active.
    const session = await Session.findOne({
      _id: payload.sessionId,
      user: payload.userId,
      revoked: false,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      res.status(401).json({
        message: "Session expired or revoked",
      });
      return;
    }

    const user = await User.findById(payload.userId);

    if (!user || user.authVersion !== payload.authVersion) {
      res.status(401).json({
        message: "Authentication is no longer valid",
      });
      return;
    }

    req.auth = {
      userId: user._id.toString(),
      sessionId: session._id.toString(),
    };

    next();
  } catch {
    res.status(401).json({
      message: "Invalid or expired access token",
    });
  }
};
