
import mongoose, { Schema, Types } from "mongoose";

export interface ISession {
  user: Types.ObjectId;
  refreshTokenHash: string;
  expiresAt: Date;
  revoked: boolean;
}

const sessionSchema = new Schema<ISession>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    refreshTokenHash: {
      type: String,
      required: true,
      unique: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    revoked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// MongoDB eventually removes expired records.
sessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

const Session = mongoose.model<ISession>(
  "Session",
  sessionSchema
);

export default Session;
