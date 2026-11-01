import type { Request, Response, NextFunction } from "express";

import User from "../models/User";
import Session from "../models/Session";

import {
  ACCESS_COOKIE,
  SESSION_MS,
  verifyAccessToken,
  getSessionDeadline,
} from "../utils/authTokens";

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = req.cookies?.[ACCESS_COOKIE];

  // Step 1: Require an access token.
  if (typeof token !== "string") {
    res.status(401).json({
      message: "Not authenticated",
    });
    return;
  }

  // Step 2: Verify the JWT.
  let payload: ReturnType<typeof verifyAccessToken>;

  try {
    payload = verifyAccessToken(token);
  } catch {
    res.status(401).json({
      message: "Invalid or expired access token",
    });
    return;
  }

  try {
    const now = new Date();

    // Step 3: Check the MongoDB login session.
    const session = await Session.findOne({
      _id: payload.sessionId,
      user: payload.userId,
      revoked: false,
      expiresAt: { $gt: now },

      // Enforce one hour from original login.
      createdAt: {
        $gt: new Date(now.getTime() - SESSION_MS),
      },
    });

    if (!session) {
      res.status(401).json({
        message: "Session expired or revoked",
      });
      return;
    }

    // Step 4: Enforce the absolute deadline.
    const deadline = getSessionDeadline(session);

    if (deadline.getTime() <= Date.now()) {
      res.status(401).json({
        message: "Login session has expired",
      });
      return;
    }

    // Step 5: Verify the user still exists.
    const user = await User.findById(payload.userId);

    if (!user || user.authVersion !== payload.authVersion) {
      res.status(401).json({
        message: "Authentication is no longer valid",
      });
      return;
    }

    // Step 6: Attach trusted identity.
    req.auth = {
      userId: user._id.toString(),
      sessionId: session._id.toString(),
    };

    next();
  } catch (error) {
    // Database failures are server errors,
    // not necessarily invalid authentication.
    next(error);
  }
};
