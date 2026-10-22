import { asyncHandler } from "../utils/asyncHandler";
import User from "../models/User";

export const requireAdmin = asyncHandler(
  async (req, res, next): Promise<void> => {
    // The protect middleware must run first.
    const userId = req.auth?.userId;

    if (!userId) {
      res.status(401).json({
        message: "Authentication required",
      });
      return;
    }

    // Read the user's current role from MongoDB.
    const user = await User.findById(userId).select("role");

    if (!user || user.role !== "admin") {
      res.status(403).json({
        message: "Administrator access required",
      });
      return;
    }

    next();
  }
);
